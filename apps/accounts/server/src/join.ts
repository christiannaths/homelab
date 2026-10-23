// Joining with an invite's link (ADR-PLAT-004): the person picks a name and password, and the
// account is made with the invite's email and App access, then signed in.
import type { Hono } from "hono";
import type { AppAccess } from "./app-access.ts";
import type { BetterAuth } from "./better-auth.ts";
import { formFields, fromOurPages } from "./forms.ts";
import type { Invite, Invites } from "./invites.ts";
import { inviteCantBeUsedPage, joinPage } from "./pages.ts";

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

    const invite = invites.take(token);
    if (!invite) return cantBeUsed();
    await makeAccount(betterAuth, appAccess, invite, { ...typed, password });

    const signedIn = await betterAuth.api.signInEmail({
      body: { email: typed.email, password },
      returnHeaders: true,
    });
    const headers = new Headers({ location: "/" });
    for (const cookie of signedIn.headers.getSetCookie())
      headers.append("set-cookie", cookie);
    return new Response(null, { status: 303, headers });
  });
}

async function makeAccount(
  betterAuth: BetterAuth,
  appAccess: AppAccess,
  invite: Invite,
  person: { email: string; name: string; password: string },
): Promise<void> {
  const ctx = await betterAuth.$context;
  const user = await ctx.internalAdapter.createUser(
    {
      email: person.email,
      name: person.name,
      emailVerified: true,
      homelabAdmin: invite.homelabAdmin,
    },
    { method: "invite" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(person.password),
  });
  // An app uninstalled since the invite was made is left out rather than refusing the person.
  appAccess.set(
    user.id,
    Object.fromEntries(
      Object.entries(invite.grants).filter(([app]) =>
        appAccess.isInstalled(app),
      ),
    ),
  );
}
