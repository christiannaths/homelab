// The accounts service (ADR-PLAT-004): its pages at accounts.<domain>, and the answer to the
// gateway's sign-in check for every request to an app.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Hono, type Context } from "hono";
import { AppAccess } from "./app-access.ts";
import { createBetterAuth } from "./better-auth.ts";
import type { Config } from "./config.ts";
import { answer, safeReturnTo } from "./forward-auth.ts";
import {
  accountPage,
  noAccessPage,
  signInPage,
  tooManyAttemptsPage,
} from "./pages.ts";

export async function createAccounts(config: Config) {
  mkdirSync(config.dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(config.dataDir, "accounts.sqlite"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  // The loader (test-people.ts) may write while the service runs, from another process.
  db.exec("PRAGMA busy_timeout = 5000;");
  const betterAuth = await createBetterAuth(db, config);
  const appAccess = new AppAccess(db, config.apps);

  const sessionOf = (headers: Headers) =>
    betterAuth.api.getSession({ headers });

  const app = new Hono();

  app.get("/api/authz/forward-auth", async (c) => {
    const session = await sessionOf(c.req.raw.headers);
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
    if (await sessionOf(c.req.raw.headers)) return c.redirect(returnTo, 302);
    return c.html(signInPage({ returnTo }));
  });

  app.post("/sign-in", async (c) => {
    // A form on another site could otherwise sign the browser in to an account of its choosing.
    if (c.req.header("origin") !== new URL(config.accountsUrl).origin)
      return c.text("Forbidden", 403);
    const form = await c.req.parseBody();
    const field = (name: string) => {
      const value = form[name];
      return typeof value === "string" ? value : "";
    };
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
    const headers = new Headers({ location: view.returnTo });
    for (const cookie of signedIn.headers.getSetCookie())
      headers.append("set-cookie", cookie);
    return new Response(null, { status: 303, headers });
  });

  // A plain link for now, as VoidAuth's was. Signs out this device only.
  app.get("/sign-out", async (c) => {
    const headers = new Headers({ location: "/sign-in" });
    if (await sessionOf(c.req.raw.headers)) {
      const signedOut = await betterAuth.api.signOut({
        headers: c.req.raw.headers,
        returnHeaders: true,
      });
      for (const cookie of signedOut.headers.getSetCookie())
        headers.append("set-cookie", cookie);
    }
    return new Response(null, { status: 302, headers });
  });

  app.get("/", async (c) => {
    const session = await sessionOf(c.req.raw.headers);
    if (!session) return c.redirect("/sign-in", 302);
    return c.html(
      accountPage({
        name: session.user.name,
        email: session.user.email,
        grants: appAccess.of(session.user.id),
      }),
    );
  });

  return { app, betterAuth, appAccess, close: () => db.close() };
}

export type Accounts = Awaited<ReturnType<typeof createAccounts>>;

/**
 * The client address the gateway put last in X-Forwarded-For. Anything before it came from the
 * browser, which could otherwise pick a fresh rate-limit bucket for every attempt.
 */
function addressGatewaySaw(c: Context): string {
  const addresses = (c.req.header("x-forwarded-for") ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
  return addresses.at(-1) ?? "";
}
