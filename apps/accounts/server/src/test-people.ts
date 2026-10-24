// Loads known people straight into the accounts service, for end-to-end tests, dev and previews,
// whose test people sign in with published passwords. A real install makes people from invites.
import { isLevel, type Grants } from "./app-access.ts";
import type { Accounts } from "./accounts.ts";
import { createAccount } from "./create-account.ts";

export interface TestPerson {
  email: string;
  password: string;
  name: string;
  homelabAdmin?: boolean;
  /** App access by app subdomain. None when left out. */
  apps?: Grants;
}

/**
 * Makes each person, or brings an existing one (by email) to exactly what is given: name,
 * password, homelab admin and App access. With `onlyMissing`, an existing person is left as they
 * are. Returns each person's account id, by email.
 */
export async function loadTestPeople(
  accounts: Accounts,
  people: TestPerson[],
  { onlyMissing = false }: { onlyMissing?: boolean } = {},
): Promise<Record<string, string>> {
  const ctx = await accounts.betterAuth.$context;
  const { minPasswordLength, maxPasswordLength } = ctx.password.config;
  const ids: Record<string, string> = {};
  for (const person of people) {
    const email = person.email.trim().toLowerCase();
    if (person.password.length < minPasswordLength)
      throw new Error(
        `${email}: a password needs at least ${minPasswordLength} characters`,
      );
    if (person.password.length > maxPasswordLength)
      throw new Error(
        `${email}: a password has at most ${maxPasswordLength} characters`,
      );
    const found = await ctx.internalAdapter.findUserByEmail(email);
    if (found && onlyMissing) {
      ids[email] = found.user.id;
      continue;
    }
    const fields = {
      name: person.name,
      homelabAdmin: person.homelabAdmin ?? false,
    };
    const grants = person.apps ?? {};
    let id: string;
    if (found) {
      id = found.user.id;
      await ctx.internalAdapter.updateUser(id, fields);
      await ctx.internalAdapter.updatePassword(
        id,
        await ctx.password.hash(person.password),
      );
      accounts.appAccess.set(id, grants);
    } else {
      const made = await createAccount(
        accounts,
        { email, password: person.password, grants, ...fields },
        { method: "test-people" },
      );
      if (!made) throw new Error(`${email}: made by someone else meanwhile`);
      id = made;
    }
    ids[email] = id;
  }
  return ids;
}

/** Narrows parsed JSON to a list of test people, naming what is wrong. */
export function parseTestPeople(value: unknown): TestPerson[] {
  if (!Array.isArray(value)) throw new Error("Expected a list of people");
  return value.map((item: unknown, index) => {
    const at = `Person ${index + 1}`;
    if (typeof item !== "object" || item === null)
      throw new Error(`${at} isn't an object`);
    const record: Record<string, unknown> = { ...item };
    const { email, password, name, homelabAdmin, apps } = record;
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof name !== "string"
    )
      throw new Error(`${at} needs an email, password and name`);
    if (homelabAdmin !== undefined && typeof homelabAdmin !== "boolean")
      throw new Error(`${at}: homelabAdmin is true or false`);
    const grants: Grants = {};
    if (apps !== undefined) {
      if (typeof apps !== "object" || apps === null)
        throw new Error(`${at}: apps maps each app to a level`);
      for (const [app, level] of Object.entries(apps)) {
        if (!isLevel(level))
          throw new Error(`${at}: ${app} needs member or admin`);
        grants[app] = level;
      }
    }
    return { email, password, name, homelabAdmin, apps: grants };
  });
}
