import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { type Context, Hono } from "hono";
import { createAuth, groupsOf, migrateAuth } from "./auth.ts";
import type { Config } from "./config.ts";
import { answer, safeReturnTo, type Person } from "./forward-auth.ts";
import { Invites } from "./invites.ts";
import { formText, groupList, isRecord, optionalString } from "./parse.ts";
import {
  accountPage,
  goneInvitePage,
  invitePage,
  noAccessPage,
  signInPage,
} from "./pages.ts";

/** Members of this group may invite people and change who may open which app. */
export const ADMINS_GROUP = "auth_admins";

const require = createRequire(import.meta.url);
const ASSETS: Record<string, string> = {
  "pages.js": readFileSync(new URL("public/pages.js", import.meta.url), "utf8"),
  // SimpleWebAuthn's browser bundle, as is, so the pages need no build step.
  "webauthn.js": readFileSync(
    path.join(
      path.dirname(require.resolve("@simplewebauthn/browser")),
      "../dist/bundle/index.umd.min.js",
    ),
    "utf8",
  ),
};

export async function createAccounts(config: Config) {
  mkdirSync(config.dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(config.dataDir, "accounts.sqlite"));
  db.exec("PRAGMA journal_mode = WAL;");
  const auth = createAuth(db, config);
  await migrateAuth(auth);
  const invites = new Invites(db);

  async function sessionOf(headers: Headers) {
    return auth.api.getSession({ headers });
  }

  const app = new Hono();

  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  app.get("/api/authz/forward-auth", async (c) => {
    const session = await sessionOf(c.req.raw.headers);
    const person: Person | undefined = session
      ? {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          groups: groupsOf(session.user),
        }
      : undefined;
    const result = answer(
      person,
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

  app.get("/assets/:file", (c) => {
    const body = ASSETS[c.req.param("file")];
    if (!body) return c.notFound();
    return c.body(body, 200, {
      "content-type": "text/javascript; charset=utf-8",
    });
  });

  app.get("/sign-in", async (c) => {
    const returnTo = safeReturnTo(c.req.query("return-to"), config);
    if (await sessionOf(c.req.raw.headers)) return c.redirect(returnTo, 302);
    return c.html(signInPage(returnTo));
  });

  // A page load, so an app's "Sign out" can be a plain link, as VoidAuth's /logout was.
  app.get("/sign-out", async (c) => {
    const headers = new Headers({ location: "/sign-in" });
    if (await sessionOf(c.req.raw.headers)) {
      const signedOut = await auth.api.signOut({
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
    const passkeys = await auth.api.listPasskeys({
      headers: c.req.raw.headers,
    });
    return c.html(
      accountPage({
        name: session.user.name,
        email: session.user.email,
        groups: groupsOf(session.user),
        passkeys: passkeys.length,
        totp: Boolean(session.user.twoFactorEnabled),
      }),
    );
  });

  app.get("/invite/:token", (c) => {
    const invite = invites.find(c.req.param("token"));
    if (!invite) return c.html(goneInvitePage(), 410);
    return c.html(invitePage(invite));
  });

  app.post("/invite/:token", async (c) => {
    const token = c.req.param("token");
    const invite = invites.find(token);
    if (!invite) return c.html(goneInvitePage(), 410);
    const form = await c.req.parseBody();
    const name = formText(form, "name").trim();
    const email = (invite.email ?? formText(form, "email"))
      .trim()
      .toLowerCase();
    const password = formText(form, "password");
    const ctx = await auth.$context;
    let error = "";
    if (!name || !email.includes("@")) error = "Enter your name and email.";
    else if (
      password.length < ctx.password.config.minPasswordLength ||
      password.length > ctx.password.config.maxPasswordLength
    )
      error = `Use a password of at least ${ctx.password.config.minPasswordLength} characters.`;
    else if (await ctx.internalAdapter.findUserByEmail(email))
      error = "There is already an account with that email.";
    if (error) return c.html(invitePage(invite, error), 400);
    if (!invites.use(token)) return c.html(goneInvitePage(), 410);

    const user = await ctx.internalAdapter.createUser(
      {
        email,
        name,
        emailVerified: true,
        groups: invite.groups.join(","),
      },
      { method: "invite" },
    );
    await ctx.internalAdapter.linkAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: await ctx.password.hash(password),
    });
    const signedIn = await auth.api.signInEmail({
      body: { email, password },
      headers: c.req.raw.headers,
      returnHeaders: true,
    });
    const headers = new Headers({ location: "/" });
    for (const cookie of signedIn.headers.getSetCookie())
      headers.append("set-cookie", cookie);
    return new Response(null, { status: 302, headers });
  });

  // The admin's JSON endpoints. The admin UI is out of the spike's scope.
  async function requireAdmin(c: Context) {
    // A cross-site form can't send JSON, and a cross-site fetch can't send it without CORS.
    if (
      c.req.header("origin") !== config.accountsUrl ||
      !c.req.header("content-type")?.startsWith("application/json")
    )
      return c.json({ error: "Bad request" }, 400);
    const session = await sessionOf(c.req.raw.headers);
    if (!session) return c.json({ error: "Sign in first" }, 401);
    if (!groupsOf(session.user).includes(ADMINS_GROUP))
      return c.json({ error: "Admins only" }, 403);
    return undefined;
  }

  app.post("/admin/invites", async (c) => {
    const refused = await requireAdmin(c);
    if (refused) return refused;
    const body: unknown = await c.req.json();
    const groups = isRecord(body) ? groupList(body.groups) : undefined;
    if (!isRecord(body) || !groups)
      return c.json({ error: "Send the invite's groups" }, 400);
    const token = invites.create({
      groups,
      email: optionalString(body, "email")?.toLowerCase() ?? null,
    });
    return c.json({ url: `${config.accountsUrl}/invite/${token}` }, 201);
  });

  app.put("/admin/people/:email/groups", async (c) => {
    const refused = await requireAdmin(c);
    if (refused) return refused;
    const body: unknown = await c.req.json();
    const groups = isRecord(body) ? groupList(body.groups) : undefined;
    if (!groups) return c.json({ error: "Send the person's groups" }, 400);
    const ctx = await auth.$context;
    const found = await ctx.internalAdapter.findUserByEmail(
      c.req.param("email").toLowerCase(),
    );
    if (!found) return c.json({ error: "No such person" }, 404);
    await ctx.internalAdapter.updateUser(found.user.id, {
      groups: groups.join(","),
    });
    return c.json({ groups });
  });

  /** On an empty install, an invite for the first admin, printed for whoever runs the server. */
  function firstRunLink(): string | undefined {
    if (db.prepare('SELECT 1 FROM "user" LIMIT 1').get()) return undefined;
    const token = invites.create({ groups: [ADMINS_GROUP], email: null });
    return `${config.accountsUrl}/invite/${token}`;
  }

  return { app, auth, db, firstRunLink };
}
