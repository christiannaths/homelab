// The accounts service (ADR-PLAT-004): its pages at accounts.<domain>, and the answer to the
// gateway's sign-in check for every request to an app.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  AppDirectory,
  manifestReader,
  type ReadManifest,
} from "@homelab/app-manifests";
import { makeSignature } from "better-auth/crypto";
import { Hono, type Context } from "hono";
import { setCookie } from "hono/cookie";
import { addAccountPage } from "./account-page.ts";
import { addJoinPage } from "./join.ts";
import { addPeoplePage } from "./people.ts";
import { Invites } from "./invites.ts";
import { AppAccess } from "./app-access.ts";
import { createBetterAuth } from "./better-auth.ts";
import { ShownApps } from "./shown-apps.ts";
import { onHomelab, type Config } from "./config.ts";
import { formFields, fromOurPages } from "./forms.ts";
import { answer, safeReturnTo } from "./forward-auth.ts";
import { noAccessPage, signInPage, tooManyAttemptsPage } from "./pages.ts";
import {
  extendedSessionOf,
  redirectWithCookies,
  sessionOf,
  withCookiesOf,
} from "./sessions.ts";

export interface Options {
  /** Replaces reading manifests through the gateway, for tests. */
  readManifest?: ReadManifest;
  /** Where warnings go, such as an app whose manifest can't be read; the console by default. */
  warn?: (message: string) => void;
  /** The clock that says when a manifest is read again, for tests. */
  now?: () => number;
}

export async function createAccounts(
  config: Config,
  {
    readManifest = manifestReader(config.gateway),
    warn = console.warn,
    now = Date.now,
  }: Options = {},
) {
  mkdirSync(config.dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(config.dataDir, "accounts.sqlite"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  // The loader (test-people.ts) may write while the service runs, from another process.
  db.exec("PRAGMA busy_timeout = 5000;");
  const betterAuth = await createBetterAuth(db, config);
  const appAccess = new AppAccess(db, config.apps);
  const invites = new Invites(db);
  const apps = new ShownApps(
    new AppDirectory(config.homelabUrl, readManifest, now),
    warn,
  );

  const app = new Hono();

  app.get("/api/authz/forward-auth", async (c) => {
    // Caddy's forward_auth passes none of this answer's cookies to the browser.
    const session = await sessionOf(betterAuth, c.req.raw.headers);
    const result = answer(
      session
        ? {
            id: session.user.id,
            email: session.user.email,
            name: session.user.name,
            grants: appAccess.of(session.user.id),
          }
        : undefined,
      {
        proto: c.req.header("x-forwarded-proto") ?? "https",
        host: c.req.header("x-forwarded-host") ?? "",
        uri: c.req.header("x-forwarded-uri") ?? "/",
      },
      config,
    );
    if (result.kind === "sign-in") return c.redirect(result.location, 302);
    if (result.kind === "no-access")
      return c.html(noAccessPage(result.app, config.accountsUrl), 403);
    return c.body(null, 200, result.headers);
  });

  app.get("/sign-in", async (c) => {
    const returnTo = safeReturnTo(c.req.query("return-to"), config);
    const { session, cookies } = await extendedSessionOf(
      betterAuth,
      c.req.raw.headers,
    );
    if (session) return redirectWithCookies(returnTo, cookies, 302);
    return c.html(signInPage({ returnTo }));
  });

  app.post("/sign-in", async (c) => {
    // A form on another site could otherwise sign the browser in to an account of its choosing.
    if (!fromOurPages(c, config.accountsUrl)) return c.text("Forbidden", 403);
    const field = await formFields(c);
    const view = {
      returnTo: safeReturnTo(field("return-to") || undefined, config),
      email: field("email").trim().toLowerCase(),
    };
    // Better Auth's own endpoint, through its handler, so its rate limit applies.
    const signedIn = await betterAuth.handler(
      new Request(new URL("/api/auth/sign-in/email", config.accountsUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "origin": new URL(config.accountsUrl).origin,
          "x-forwarded-for": addressGatewaySaw(c),
        },
        body: JSON.stringify({
          email: view.email,
          password: field("password"),
        }),
      }),
    );
    if (signedIn.status === 429) return c.html(tooManyAttemptsPage(view), 429);
    if (!signedIn.ok)
      return c.html(
        signInPage({ ...view, error: "Wrong email or password." }),
        401,
      );
    return redirectWithCookies(view.returnTo, signedIn.headers);
  });

  // A link or an image on any site could otherwise sign the browser out.
  app.get("/sign-out", (c) =>
    c.text("Sign out from the App switcher.", 405, { allow: "POST" }),
  );

  // Sent by the App switcher's fetch from an app's page, or by a form on this site. Signs out
  // this device only.
  app.post("/sign-out", async (c) => {
    const origin = homelabPageOf(c, config.homelabUrl);
    if (!origin) return c.text("Forbidden", 403);
    const cookies = (await sessionOf(betterAuth, c.req.raw.headers))
      ? (
          await betterAuth.api.signOut({
            headers: c.req.raw.headers,
            returnHeaders: true,
          })
        ).headers
      : new Headers();
    const fromForm = c.req
      .header("content-type")
      ?.startsWith("application/x-www-form-urlencoded");
    if (fromForm) return redirectWithCookies("/sign-in", cookies);
    // The switcher reads the answer from another app's origin, then shows the sign-in page.
    return withCookiesOf(answerForPage(origin), cookies);
  });

  // Sent by the App switcher on every page load. Caddy's forward auth can't pass a cookie back to
  // the browser, so this is how a person who only uses apps keeps their session going.
  app.post("/session", async (c) => {
    const origin = homelabPageOf(c, config.homelabUrl);
    if (!origin) return c.text("Forbidden", 403);
    const { cookies } = await extendedSessionOf(betterAuth, c.req.raw.headers);
    return withCookiesOf(answerForPage(origin), cookies);
  });

  // Who is signed in and which apps they have, for the App switcher in every app.
  // The accounts site is outside the gateway's sign-in check, so a signed-out browser gets an
  // answer its page can read rather than the gateway's redirect. A fetch from an app's page is a
  // simple GET with no preflight; one from this site's own pages sends no Origin.
  app.get("/api/me", async (c) => {
    const origin = c.req.header("origin");
    if (
      c.req.header("sec-fetch-site") === "cross-site" ||
      (origin !== undefined && !isHomelabOrigin(origin, config.homelabUrl))
    )
      return c.text("Forbidden", 403);
    if (origin) {
      c.header("access-control-allow-origin", origin);
      c.header("access-control-allow-credentials", "true");
    }
    c.header("vary", "Origin");
    c.header("cache-control", "no-store");
    const session = await sessionOf(betterAuth, c.req.raw.headers);
    if (!session) return c.json({ error: "signed_out" }, 401);
    return c.json({
      person: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
      },
      accountUrl: new URL("/", config.accountsUrl).href,
      signOutUrl: new URL("/sign-out", config.accountsUrl).href,
      apps: await apps.of(appAccess.of(session.user.id)),
    });
  });

  if (config.testSignInLinks)
    app.get("/test-sign-in", async (c) => {
      const ctx = await betterAuth.$context;
      const email = (c.req.query("email") ?? "").trim().toLowerCase();
      const found = await ctx.internalAdapter.findUserByEmail(email);
      if (!found) return c.notFound();
      const session = await ctx.internalAdapter.createSession(found.user.id);
      // Signed as Better Auth signs its own session cookie, which it reads back on every request.
      const signature = await makeSignature(session.token, ctx.secret);
      const { name, attributes } = ctx.authCookies.sessionToken;
      setCookie(c, name, `${session.token}.${signature}`, {
        domain: attributes.domain,
        path: attributes.path ?? "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        maxAge: ctx.sessionConfig.expiresIn,
      });
      return c.redirect(safeReturnTo(c.req.query("return-to"), config), 302);
    });

  addAccountPage(app, {
    accountsUrl: config.accountsUrl,
    betterAuth,
    appAccess,
    apps,
  });
  addPeoplePage(app, {
    accountsUrl: config.accountsUrl,
    betterAuth,
    appAccess,
    invites,
    apps,
    installed: config.apps,
  });
  addJoinPage(app, {
    accountsUrl: config.accountsUrl,
    betterAuth,
    appAccess,
    invites,
  });

  return {
    app,
    betterAuth,
    appAccess,
    /**
     * On an install with no accounts, the link that makes the first homelab admin, replacing any
     * earlier one. Nothing once anyone has an account.
     */
    setupInvite: (): string | undefined => {
      const token = invites.setup();
      return token && new URL(`/join/${token}`, config.accountsUrl).href;
    },
    close: () => db.close(),
  };
}

export type Accounts = Awaited<ReturnType<typeof createAccounts>>;

/**
 * The Origin of a request sent from a page of the homelab, an app's or this site's, or undefined
 * for anything another site could send.
 */
function homelabPageOf(c: Context, homelabUrl: URL): string | undefined {
  const origin = c.req.header("origin");
  return c.req.header("sec-fetch-site") !== "cross-site" &&
    isHomelabOrigin(origin, homelabUrl)
    ? origin
    : undefined;
}

/** An empty answer that the page at `origin` may read, having sent the homelab's cookie. */
function answerForPage(origin: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-credentials": "true",
      "vary": "Origin",
    },
  });
}

/** Whether a request's Origin is a page of the homelab: an app's, or this site's. */
function isHomelabOrigin(
  origin: string | undefined,
  homelabUrl: URL,
): origin is string {
  if (!origin) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  return onHomelab(url, homelabUrl) && url.hostname !== homelabUrl.hostname;
}

/**
 * The client address the gateway put last in X-Forwarded-For. Anything before it came from the
 * browser, which could otherwise pick a fresh rate-limit bucket for every attempt. A request with
 * no address shares one bucket with every other such request, so the limit never stops applying.
 */
function addressGatewaySaw(c: Context): string {
  const addresses = (c.req.header("x-forwarded-for") ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
  return addresses.at(-1) ?? NO_ADDRESS;
}

/** A documentation address (RFC 5737), which no real client has. */
const NO_ADDRESS = "192.0.2.0";
