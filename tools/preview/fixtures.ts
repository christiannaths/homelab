// The test accounts every preview starts with: the same people and published passwords as
// `npm run dev` (tools/dev/start.ts), since previews are open by design (ADR-PLAT-008).
// Adding an app to the homelab means adding it here, to the Caddyfile and Dockerfile next to this
// file, and to tools/dev, together.
import type { App, Person } from "@homelab/voidauth-fixtures";

/**
 * The instance admin VoidAuth creates on first run. VoidAuth lets it into every app, but Home lists
 * only the apps whose groups it has (ADR-PLAT-004).
 */
export const ADMIN = {
  username: "auth_admin",
  password: "violet-quartz-harbour-71",
  groups: ["notes-admins", "encyclopedia"],
  gets: "The homelab admin: every app, Notes as an owner, VoidAuth's admin pages",
};

/**
 * Each app's site and VoidAuth groups, named after the site: being in any of them lets a person
 * into the app. Home has none, so every account reaches it.
 */
export const APPS = [
  { site: "home", name: "Home", groups: [] },
  { site: "notes", name: "Notes", groups: ["notes", "notes-admins"] },
  { site: "encyclopedia", name: "Encyclopedia", groups: ["encyclopedia"] },
];

/** The test people, each with what their groups get them, for the pull request comment. */
export const PEOPLE: (Person & { gets: string })[] = [
  {
    username: "ada",
    password: "lantern-meadow-copper-48",
    name: "Ada Lovelace",
    email: "ada@example.com",
    groups: ["notes-admins", "encyclopedia"],
    gets: "Notes as an owner, and the Encyclopedia",
  },
  {
    username: "dana",
    password: "quartz-ember-willow-27",
    name: "Dana Scully",
    email: "dana@example.com",
    groups: ["notes"],
    gets: "Notes as a member, no Encyclopedia",
  },
  {
    username: "bob",
    password: "harbour-violet-thistle-93",
    name: "Bob Ross",
    groups: [],
    gets: "A homelab account but no apps: Home only",
  },
];

/** The apps under one preview's domain, `<name>.<preview domain>`. */
export const appsUnder = (domain: string): App[] =>
  APPS.map(({ site, name, groups }) => ({
    host: `${site}.${domain}`,
    name,
    groups,
  }));
