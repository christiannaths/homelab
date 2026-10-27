// The apps and test people that `npm run dev` (tools/dev) and every preview (tools/preview) start
// with, signing in by email with these published passwords. Previews are open by design
// (ADR-PLAT-008), so nothing real goes in them. The accounts service's own loader
// (platform/accounts/src/load-test-people.ts) makes the people. Adding an app to the homelab
// means adding it here, to the preview's Caddyfile and Dockerfile, and to tools/dev, together.

/** Each app's site, named after its subdomain. */
export const APPS = [
  { site: "notes", name: "Notes" },
  { site: "encyclopedia", name: "Encyclopedia" },
];

/** The accounts service's HOMELAB_APPS. */
export const INSTALLED_APPS = APPS.map((app) => app.site).join(",");

/** A person as the accounts service's loader takes them, with what they get, for the summaries. */
export interface TestPerson {
  email: string;
  password: string;
  name: string;
  homelabAdmin?: boolean;
  apps: Record<string, "member" | "admin">;
  gets: string;
}

export const ADMIN: TestPerson = {
  email: "admin@example.com",
  password: "violet-quartz-harbour-71",
  name: "Homelab Admin",
  homelabAdmin: true,
  apps: { notes: "admin", encyclopedia: "member" },
  gets: "The homelab admin: Notes as an owner, and the Encyclopedia",
};

export const ADA: TestPerson = {
  email: "ada@example.com",
  password: "lantern-meadow-copper-48",
  name: "Ada Lovelace",
  apps: { notes: "admin", encyclopedia: "member" },
  gets: "Notes as an owner, and the Encyclopedia",
};

export const DANA: TestPerson = {
  email: "dana@example.com",
  password: "quartz-ember-willow-27",
  name: "Dana Scully",
  apps: { notes: "member" },
  gets: "Notes as a member, no Encyclopedia",
};

export const BOB: TestPerson = {
  email: "bob@example.com",
  password: "harbour-violet-thistle-93",
  name: "Bob Ross",
  apps: {},
  gets: "A homelab account but no apps",
};

export const PEOPLE = [ADMIN, ADA, DANA, BOB];

/** The loader's command, run with the accounts service's environment and the people on stdin. */
export const LOAD_TEST_PEOPLE = [
  "--no-experimental-webstorage",
  "platform/accounts/src/load-test-people.ts",
  // A later start keeps whatever changed since, as a household's own accounts would be kept.
  "--only-missing",
];
