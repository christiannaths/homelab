// Joining with an invite's link (ADR-PLAT-004): the person picks a name and password, and the
// account is made with the invite's email and App access, then signed in.
import type { Hono } from "hono";
import type { AppAccess } from "./app-access.ts";
import type { BetterAuth } from "./better-auth.ts";
import { createAccount } from "./create-account.ts";
import { formFields, fromOurPages } from "./forms.ts";
import type { Invites } from "./invites.ts";
import { inviteCantBeUsedPage, joinPage } from "./pages.ts";
import { redirectWithCookies } from "./sessions.ts";

export interface JoinDeps {
  accountsUrl: string;
  betterAuth: BetterAuth;
  appAccess: AppAccess;
  invites: Invites;
}

export function addJoinPage(
  app: Hono,
  { accountsUrl, betterAuth, appAccess, invites }: JoinDeps,
): void {
  // 410: the link worked once, and won't again.
  const cantBeUsed = () =>
    new Response(inviteCantBeUsedPage(), {
      status: 410,
      headers: { "content-type": "text/html; charset=UTF-8" },
    });

  app.get("/join/:token", (c) => {
    const invite = invites.find(c.req.param("token"));
    if (!invite) return cantBeUsed();
    return c.html(joinPage({ email: invite.email }));
  });

  app.post("/join/:token", async (c) => {
    // A form on another site could otherwise make an account with a leaked link and sign the
    // browser in to it.
    if (!fromOurPages(c, accountsUrl)) return c.text("Forbidden", 403);
    const token = c.req.param("token");
    const found = invites.find(token);
    if (!found) return cantBeUsed();
    const field = await formFields(c);
    const typed = {
      email: (found.email ?? field("email")).trim().toLowerCase(),
      name: field("name").trim(),
    };
    const password = field("password");
    const ctx = await betterAuth.$context;
    const { minPasswordLength, maxPasswordLength } = ctx.password.config;
    const refuse = (error: string) =>
      c.html(joinPage({ email: found.email, typed, error }), 400);
    if (!typed.email.includes("@")) return refuse("Enter your email.");
    if (!typed.name) return refuse("Enter your name.");
    if (password.length < minPasswordLength)
      return refuse(
        `Use a password of at least ${minPasswordLength} characters.`,
      );
    if (password.length > maxPasswordLength)
      return refuse("Use a shorter password.");
    if (await ctx.internalAdapter.findUserByEmail(typed.email))
      return cantBeUsed();

    // Another join for the same email may have made the account since the check above; then
    // the invite is left as it was.
    const made = await createAccount(
      { betterAuth, appAccess },
      {
        ...typed,
        password,
        homelabAdmin: found.homelabAdmin,
        // An app uninstalled since the invite was made is left out rather than refusing the
        // person.
        grants: Object.fromEntries(
          Object.entries(found.grants).filter(([id]) =>
            appAccess.isInstalled(id),
          ),
        ),
      },
      { method: "invite", claim: () => invites.take(token) !== undefined },
    );
    if (!made) return cantBeUsed();

    const signedIn = await betterAuth.api.signInEmail({
      body: { email: typed.email, password },
      returnHeaders: true,
    });
    return redirectWithCookies("/", signedIn.headers);
  });
}
