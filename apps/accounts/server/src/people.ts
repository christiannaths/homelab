// The People page, where homelab admins manage everyone's accounts and invite people
// (ADR-PLAT-004). Only homelab admins may open it or use it.
import type { AppDirectory } from "@homelab/app-manifests";
import type { Context, Hono } from "hono";
import { isLevel, type AppAccess, type Grants } from "./app-access.ts";
import type { BetterAuth } from "./better-auth.ts";
import { fromOurPages } from "./forms.ts";
import { signInUrl } from "./forward-auth.ts";
import type { Invites } from "./invites.ts";
import {
  adminsOnlyPage,
  appName,
  peoplePage,
  type PeopleView,
} from "./pages.ts";

export interface PeoplePageDeps {
  accountsUrl: string;
  betterAuth: BetterAuth;
  appAccess: AppAccess;
  invites: Invites;
  directory: AppDirectory;
  /** The installed apps' subdomains. */
  installed: readonly string[];
}

const APP_FIELD = "app-";

export function addPeoplePage(app: Hono, deps: PeoplePageDeps): void {
  const { accountsUrl, betterAuth, appAccess, invites, directory, installed } =
    deps;
  const signIn = signInUrl(accountsUrl, "/people");

  /** The signed-in homelab admin, or the answer for anyone else. */
  const adminOf = async (c: Context, method: "GET" | "POST") => {
    const session = await betterAuth.api.getSession({
      headers: c.req.raw.headers,
    });
    if (!session)
      return { refused: c.redirect(signIn, method === "GET" ? 302 : 303) };
    if (session.user.homelabAdmin !== true)
      return { refused: c.html(adminsOnlyPage(), 403) };
    return { admin: session.user };
  };

  const nameOf = async (id: string) =>
    (await directory.app(id))?.name ?? appName(id);

  const page = async (view: Pick<PeopleView, "made" | "inviteForm"> = {}) =>
    peoplePage({
      installed: await Promise.all(
        installed.map(async (id) => ({ id, name: await nameOf(id) })),
      ),
      invites: await Promise.all(
        invites.pending().map(async (invite) => ({
          id: invite.id,
          email: invite.email ?? "",
          apps: await Promise.all(
            Object.entries(invite.grants).map(async ([id, level]) => ({
              name: await nameOf(id),
              level,
            })),
          ),
          expiresAt: invite.expiresAt,
        })),
      ),
      ...view,
    });

  app.get("/people", async (c) => {
    const { refused } = await adminOf(c, "GET");
    if (refused) return refused;
    return c.html(await page());
  });

  app.post("/people/invites", async (c) => {
    if (!fromOurPages(c, accountsUrl)) return c.text("Forbidden", 403);
    const { admin, refused } = await adminOf(c, "POST");
    if (refused) return refused;
    const form = await c.req.parseBody();
    const email = (typeof form.email === "string" ? form.email : "")
      .trim()
      .toLowerCase();
    const chosen: Record<string, string> = {};
    for (const [name, value] of Object.entries(form))
      if (name.startsWith(APP_FIELD) && typeof value === "string" && value)
        chosen[name.slice(APP_FIELD.length)] = value;

    const refuse = async (error: string) =>
      c.html(await page({ inviteForm: { email, grants: chosen, error } }), 400);
    if (!email.includes("@")) return refuse("Enter the email to invite.");
    const grants: Grants = {};
    for (const [id, level] of Object.entries(chosen)) {
      if (!appAccess.isInstalled(id))
        return refuse(`${id} isn't an app on this homelab.`);
      if (!isLevel(level)) return refuse(`Choose member or admin for ${id}.`);
      grants[id] = level;
    }
    const ctx = await betterAuth.$context;
    if (await ctx.internalAdapter.findUserByEmail(email))
      return refuse(`${email} already has an account.`);

    const token = invites.make({ email, grants, madeBy: admin.id });
    const link = new URL(`/join/${token}`, accountsUrl).href;
    return c.html(await page({ made: { email, link } }));
  });

  app.post("/people/invites/:id/cancel", async (c) => {
    if (!fromOurPages(c, accountsUrl)) return c.text("Forbidden", 403);
    const { refused } = await adminOf(c, "POST");
    if (refused) return refused;
    invites.cancel(c.req.param("id"));
    return c.redirect("/people", 303);
  });
}
