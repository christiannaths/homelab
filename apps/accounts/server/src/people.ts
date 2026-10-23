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
  type PersonEntry,
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

  /** An app's name and icon from its manifest, or its subdomain when that can't be read. */
  const appOf = async (id: string) => {
    const read = await directory.app(id);
    return { id, name: read?.name ?? appName(id), icon: read?.icon ?? null };
  };
  const nameOf = async (id: string) => (await appOf(id)).name;

  const everyone = async (): Promise<PersonEntry[]> => {
    const ctx = await betterAuth.$context;
    // Better Auth lists 100 people unless told how many to list.
    const users = await ctx.internalAdapter.listUsers(
      await ctx.internalAdapter.countTotalUsers(),
    );
    return Promise.all(
      users.map(async (user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        homelabAdmin: "homelabAdmin" in user && user.homelabAdmin === true,
        apps: await Promise.all(
          Object.entries(appAccess.of(user.id)).map(async ([id, level]) => ({
            ...(await appOf(id)),
            level,
          })),
        ),
      })),
    );
  };

  const page = async (
    view: Pick<PeopleView, "made" | "inviteForm" | "error"> = {},
  ) =>
    peoplePage({
      installed: await Promise.all(
        installed.map(async (id) => ({ id, name: await nameOf(id) })),
      ),
      people: await everyone(),
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
    const chosen = chosenApps(form);

    const refuse = async (error: string) =>
      c.html(await page({ inviteForm: { email, grants: chosen, error } }), 400);
    if (!email.includes("@")) return refuse("Enter the email to invite.");
    const { grants, error } = grantsOf(chosen);
    if (error !== undefined) return refuse(error);
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

  // Two admins demoting each other at once could otherwise both see another admin left, and
  // leave none.
  const oneAtATime = inTurn();

  /**
   * An action on one person's account, which answers "done", or why it was refused.
   */
  const onPerson = (
    action: string,
    act: (
      person: Person,
      form: Record<string, unknown>,
    ) => Promise<Refusal | "done">,
  ) =>
    app.post(`/people/:id/${action}`, async (c) => {
      if (!fromOurPages(c, accountsUrl)) return c.text("Forbidden", 403);
      const { refused } = await adminOf(c, "POST");
      if (refused) return refused;
      const form = await c.req.parseBody();
      const refusal = await oneAtATime(async () => {
        const ctx = await betterAuth.$context;
        const person = await ctx.internalAdapter.findUserById(
          c.req.param("id"),
        );
        if (!person) return { status: 404, error: NO_ACCOUNT } as const;
        return act(person, form);
      });
      if (refusal === "done") return c.redirect("/people", 303);
      return c.html(await page({ error: refusal.error }), refusal.status);
    });

  onPerson("apps", async (person, form) => {
    const { grants, error } = grantsOf(chosenApps(form));
    if (error !== undefined) return { status: 400, error };
    appAccess.set(person.id, grants);
    return "done";
  });

  onPerson("homelab-admin", async (person, form) => {
    const on = form["homelab-admin"] === "on";
    if (!on && (await isLastAdmin(person))) return LAST_ADMIN;
    const ctx = await betterAuth.$context;
    await ctx.internalAdapter.updateUser(person.id, { homelabAdmin: on });
    return "done";
  });

  onPerson("sign-out", async (person) => {
    const ctx = await betterAuth.$context;
    await ctx.internalAdapter.deleteUserSessions(person.id);
    return "done";
  });

  // Their App access and the invites they made go with the account (app-access.ts, invites.ts).
  onPerson("remove", async (person) => {
    if (await isLastAdmin(person)) return LAST_ADMIN;
    const ctx = await betterAuth.$context;
    await ctx.internalAdapter.deleteUser(person.id);
    return "done";
  });

  const isLastAdmin = async (person: Person) => {
    if (person.homelabAdmin !== true) return false;
    const ctx = await betterAuth.$context;
    const admins = await ctx.internalAdapter.countTotalUsers([
      { field: "homelabAdmin", value: true },
    ]);
    return admins <= 1;
  };

  /** The apps a form chose a level for, by subdomain, as the form sent them. */
  const chosenApps = (form: Record<string, unknown>) => {
    const chosen: Record<string, string> = {};
    for (const [name, value] of Object.entries(form))
      if (name.startsWith(APP_FIELD) && typeof value === "string" && value)
        chosen[name.slice(APP_FIELD.length)] = value;
    return chosen;
  };

  /** App access from what a form chose, or why it can't be granted. */
  const grantsOf = (
    chosen: Record<string, string>,
  ):
    | { grants: Grants; error?: undefined }
    | { grants?: undefined; error: string } => {
    const grants: Grants = {};
    for (const [id, level] of Object.entries(chosen)) {
      if (!appAccess.isInstalled(id))
        return { error: `${id} isn't an app on this homelab.` };
      if (!isLevel(level))
        return { error: `Choose member or admin for ${id}.` };
      grants[id] = level;
    }
    return { grants };
  };
}

type Person = { id: string; homelabAdmin?: unknown };

interface Refusal {
  status: 400 | 404 | 409;
  error: string;
}

const NO_ACCOUNT = "That person has no account any more.";
const LAST_ADMIN: Refusal = {
  status: 409,
  error: "The homelab needs at least one homelab admin.",
};

/** A runner that runs the work given to it one piece after another, never at once. */
function inTurn() {
  let queue: Promise<unknown> = Promise.resolve();
  return <T>(work: () => Promise<T>): Promise<T> => {
    const done = queue.then(work);
    queue = done.catch(() => undefined);
    return done;
  };
}
