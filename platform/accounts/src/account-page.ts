// A person's own account page on the accounts site (ADR-PLAT-004): their name, email and apps, and
// the forms that change their name and password.
import type { Hono } from "hono";
import type { AppAccess } from "./app-access.ts";
import type { BetterAuth } from "./better-auth.ts";
import { formFields, fromOurPages } from "./forms.ts";
import { signInUrl } from "./forward-auth.ts";
import { accountPage, type AccountForms } from "./pages.ts";
import type { ShownApps } from "./shown-apps.ts";
import {
  extendedSessionOf,
  redirectWithCookies,
  sessionOf,
  withCookiesOf,
  type Session,
} from "./sessions.ts";

export interface AccountPageDeps {
  accountsUrl: string;
  betterAuth: BetterAuth;
  appAccess: AppAccess;
  apps: ShownApps;
}

/** Where a confirmed change sends the browser, and what the page then says. */
const CHANGED = new Map([
  ["name", "Your name is changed."],
  ["password", "Your password is changed."],
]);

export function addAccountPage(
  app: Hono,
  { accountsUrl, betterAuth, appAccess, apps }: AccountPageDeps,
): void {
  const signIn = signInUrl(accountsUrl, "/");

  const page = async (session: Session, forms: AccountForms = {}) =>
    accountPage({
      name: session.user.name,
      email: session.user.email,
      homelabAdmin: session.user.homelabAdmin === true,
      apps: await Promise.all(
        Object.entries(appAccess.of(session.user.id)).map(
          async ([id, level]) => {
            const { name, url, icon } = await apps.app(id);
            return { name, url, icon, level };
          },
        ),
      ),
      ...forms,
    });

  app.get("/", async (c) => {
    const { session, cookies } = await extendedSessionOf(
      betterAuth,
      c.req.raw.headers,
    );
    if (!session) return redirectWithCookies(signIn, cookies, 302);
    const changed = CHANGED.get(c.req.query("changed") ?? "");
    return withCookiesOf(c.html(await page(session, { changed })), cookies);
  });

  app.post("/name", async (c) => {
    if (!fromOurPages(c, accountsUrl)) return c.text("Forbidden", 403);
    const session = await sessionOf(betterAuth, c.req.raw.headers);
    if (!session) return c.redirect(signIn, 303);
    const name = (await formFields(c))("name").trim();
    if (!name)
      return c.html(await page(session, { nameError: "Enter a name." }), 400);
    const updated = await betterAuth.api.updateUser({
      headers: c.req.raw.headers,
      body: { name },
      returnHeaders: true,
    });
    return redirectWithCookies("/?changed=name", updated.headers);
  });

  app.post("/password", async (c) => {
    if (!fromOurPages(c, accountsUrl)) return c.text("Forbidden", 403);
    const session = await sessionOf(betterAuth, c.req.raw.headers);
    if (!session) return c.redirect(signIn, 303);
    const field = await formFields(c);
    const changed = await betterAuth.api.changePassword({
      headers: c.req.raw.headers,
      body: {
        currentPassword: field("current-password"),
        newPassword: field("new-password"),
      },
      asResponse: true,
    });
    if (changed.ok)
      return redirectWithCookies("/?changed=password", changed.headers);
    const passwordError = await passwordErrorOf(changed);
    return c.html(await page(session, { passwordError }), 400);
  });
}

/** What to tell the person when Better Auth refuses a new password. */
async function passwordErrorOf(refused: Response): Promise<string> {
  const body: unknown = await refused.json().catch(() => undefined);
  const code =
    typeof body === "object" && body !== null && "code" in body
      ? body.code
      : undefined;
  if (code === "PASSWORD_TOO_SHORT")
    return "Use a new password of at least 8 characters.";
  if (code === "PASSWORD_TOO_LONG") return "Use a shorter new password.";
  if (code === "INVALID_PASSWORD") return "Your current password is wrong.";
  return "Your password couldn't be changed. Try again.";
}
