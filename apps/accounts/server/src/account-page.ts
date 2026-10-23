// A person's own account page on the accounts site (ADR-PLAT-004): their name, email and apps, and
// the forms that change their name and password.
import type { AppDirectory } from "@homelab/app-manifests";
import type { Hono } from "hono";
import type { AppAccess } from "./app-access.ts";
import type { BetterAuth } from "./better-auth.ts";
import { formFields, fromOurPages } from "./forms.ts";
import { signInUrl } from "./forward-auth.ts";
import { accountPage, appName, type AccountForms } from "./pages.ts";

export interface AccountPageDeps {
  accountsUrl: string;
  betterAuth: BetterAuth;
  appAccess: AppAccess;
  directory: AppDirectory;
}

type Session = NonNullable<
  Awaited<ReturnType<BetterAuth["api"]["getSession"]>>
>;

/** Where a confirmed change sends the browser, and what the page then says. */
const CHANGED: Record<string, string> = {
  name: "Your name is changed.",
  password: "Your password is changed.",
};

export function addAccountPage(
  app: Hono,
  { accountsUrl, betterAuth, appAccess, directory }: AccountPageDeps,
): void {
  const signIn = signInUrl(accountsUrl, "/");

  const sessionOf = (headers: Headers) =>
    betterAuth.api.getSession({ headers });

  const page = async (session: Session, forms: AccountForms = {}) =>
    accountPage({
      name: session.user.name,
      email: session.user.email,
      homelabAdmin: session.user.homelabAdmin === true,
      apps: await Promise.all(
        Object.entries(appAccess.of(session.user.id)).map(
          async ([id, level]) => {
            const read = await directory.app(id);
            return {
              name: read?.name ?? appName(id),
              url: read?.url ?? directory.urlOf(id).href,
              icon: read?.icon ?? null,
              level,
            };
          },
        ),
      ),
      ...forms,
    });

  app.get("/", async (c) => {
    const session = await sessionOf(c.req.raw.headers);
    if (!session) return c.redirect(signIn, 302);
    const changed = CHANGED[c.req.query("changed") ?? ""];
    return c.html(await page(session, { changed }));
  });

  app.post("/name", async (c) => {
    if (!fromOurPages(c, accountsUrl)) return c.text("Forbidden", 403);
    const session = await sessionOf(c.req.raw.headers);
    if (!session) return c.redirect(signIn, 303);
    const name = (await formFields(c))("name").trim();
    if (!name)
      return c.html(await page(session, { nameError: "Enter a name." }), 400);
    const updated = await betterAuth.api.updateUser({
      headers: c.req.raw.headers,
      body: { name },
      returnHeaders: true,
    });
    const headers = new Headers({ location: "/?changed=name" });
    for (const cookie of updated.headers.getSetCookie())
      headers.append("set-cookie", cookie);
    return new Response(null, { status: 303, headers });
  });

  app.post("/password", async (c) => {
    if (!fromOurPages(c, accountsUrl)) return c.text("Forbidden", 403);
    const session = await sessionOf(c.req.raw.headers);
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
    if (changed.ok) return c.redirect("/?changed=password", 303);
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
