// The People page, where homelab admins manage everyone's accounts (ADR-PLAT-004). Only homelab
// admins may open it or use it.
import type { Hono } from "hono";
import type { BetterAuth } from "./better-auth.ts";
import { signInUrl } from "./forward-auth.ts";
import { adminsOnlyPage, peoplePage } from "./pages.ts";

export interface PeoplePageDeps {
  accountsUrl: string;
  betterAuth: BetterAuth;
}

export function addPeoplePage(
  app: Hono,
  { accountsUrl, betterAuth }: PeoplePageDeps,
): void {
  app.get("/people", async (c) => {
    const session = await betterAuth.api.getSession({
      headers: c.req.raw.headers,
    });
    if (!session) return c.redirect(signInUrl(accountsUrl, "/people"), 302);
    if (session.user.homelabAdmin !== true)
      return c.html(adminsOnlyPage(), 403);
    return c.html(peoplePage());
  });
}
