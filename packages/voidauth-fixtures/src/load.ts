// Loads test fixtures into VoidAuth the way a homelab admin would set it up (ADR-PLAT-004): the
// admin password, a group per app grant, a ProxyAuth domain per app, and one invited account per
// person. Loading again only adds what is missing, so a kept stack can be loaded on every start.
import { VoidAuthClient } from "./client.ts";
import { isRecord, records, stringField } from "./json.ts";

export interface App {
  name: string;
  /** The app's hostname, such as `notes.homelab.localhost`. */
  host: string;
  /** Being in any of these VoidAuth groups lets a person into the app. */
  groups: string[];
}

export interface Person {
  username: string;
  password: string;
  /** Null for a person VoidAuth has no name for. */
  name: string | null;
  /** Leaving it out gives the person no email, as for `name`. */
  email?: string;
  groups: string[];
}

export interface Fixtures {
  /**
   * The instance admin VoidAuth creates on first run, and the password to give it. VoidAuth puts
   * it in `auth_admins`, which lets it into every app but lists none in Home: like everyone, it
   * is given each app's group.
   */
  admin: { username: string; password: string; groups?: string[] };
  apps: App[];
  people: Person[];
  /** VoidAuth's log, which holds the first-run link for setting the admin's password. */
  readLog: () => Promise<string> | string;
}

/** Loads the fixtures and returns the admin's signed-in client. */
export async function loadFixtures(
  admin: VoidAuthClient,
  { admin: account, apps, people, readLog }: Fixtures,
): Promise<VoidAuthClient> {
  await admin.waitUntilUp();
  if (!(await admin.signIn(account))) {
    await admin.json(
      "Setting the admin password",
      "POST",
      "/api/public/reset_password",
      { ...parseFirstRunLink(await readLog()), newPassword: account.password },
    );
    if (!(await admin.signIn(account)))
      throw new Error(
        `Can't sign in as ${account.username}: its password was changed since the first run`,
      );
  }

  const groupsNow = async () =>
    records(await admin.json("Listing groups", "GET", "/api/admin/groups"));
  let groups = await groupsNow();
  for (const name of new Set([
    ...apps.flatMap((app) => app.groups),
    ...(account.groups ?? []),
  ]))
    if (!groups.some((group) => group.name === name))
      await admin.json(`Adding group ${name}`, "POST", "/api/admin/group", {
        name,
        mfaRequired: false,
        autoAssign: false,
        users: [],
        customClaims: [],
      });
  groups = await groupsNow();

  const domains = records(
    await admin.json(
      "Listing ProxyAuth domains",
      "GET",
      "/api/admin/proxyauths",
    ),
  );
  for (const app of apps) {
    const domain = `${app.host}/*`;
    if (!domains.some((existing) => existing.domain === domain))
      await admin.json(
        `Adding ${app.name}'s ProxyAuth domain`,
        "POST",
        "/api/admin/proxyauth",
        {
          domain,
          mfaRequired: false,
          maxSessionLength: null,
          groups: app.groups,
        },
      );
  }

  const listed = await admin.json(
    "Listing accounts",
    "GET",
    "/api/admin/users?page=0&pageSize=1000",
  );
  const users = records(isRecord(listed) ? listed.users : undefined);
  await changeGroups(admin, account.username, (has) => [
    ...has,
    ...(account.groups ?? []),
  ]);
  for (const person of people) {
    if (users.some((user) => user.username === person.username)) continue;
    const invite = await admin.json(
      `Inviting ${person.username}`,
      "POST",
      "/api/admin/invitation",
      {
        username: person.username,
        name: person.name,
        email: person.email ?? null,
        userExpiresAt: null,
        emailVerified: false,
        mfaRequired: false,
        groups: groups
          .filter((group) => person.groups.includes(String(group.name)))
          .map((group) => ({ id: group.id, name: group.name })),
        customClaims: [],
      },
    );
    // Accepting an invite happens inside a sign-in interaction, as on VoidAuth's invite page.
    const newcomer = new VoidAuthClient(admin.address);
    await newcomer.startInteraction();
    await newcomer.json(
      `Accepting ${person.username}'s invite`,
      "POST",
      "/api/interaction/register",
      {
        username: person.username,
        password: person.password,
        name: person.name ?? undefined,
        inviteId: stringField(invite, "id"),
        challenge: stringField(invite, "challenge"),
      },
    );
  }
  return admin;
}

/**
 * Changes an account's groups, as a homelab admin would on VoidAuth's admin page: `change` is
 * given the groups it has and returns the ones it should have. Granting and removing an app is
 * changing its group (ADR-PLAT-004).
 */
export async function changeGroups(
  admin: VoidAuthClient,
  username: string,
  change: (has: string[]) => string[],
): Promise<void> {
  const listed = await admin.json(
    "Listing accounts",
    "GET",
    "/api/admin/users?page=0&pageSize=1000",
  );
  const id = records(isRecord(listed) ? listed.users : undefined).find(
    (user) => user.username === username,
  )?.id;
  if (typeof id !== "string")
    throw new Error(`VoidAuth has no account ${username}`);
  const user = await admin.json(
    `Reading ${username}`,
    "GET",
    `/api/admin/user/${id}`,
  );
  if (!isRecord(user))
    throw new Error(`Not an account: ${JSON.stringify(user)}`);
  const has = records(user.groups).map((group) => String(group.name));
  const wanted = new Set(change(has));
  if (wanted.size === has.length && has.every((name) => wanted.has(name)))
    return;
  const groups = records(
    await admin.json("Listing groups", "GET", "/api/admin/groups"),
  );
  // VoidAuth's update replaces the whole account, so every field is sent back as it was.
  await admin.json(
    `Changing ${username}'s groups`,
    "PATCH",
    "/api/admin/user",
    {
      id,
      username: user.username,
      name: user.name ?? null,
      email: user.email ?? null,
      expiresAt: user.expiresAt ?? null,
      // VoidAuth reads its booleans back from SQLite as 0 and 1, and accepts only true and false.
      emailVerified: Boolean(user.emailVerified),
      approved: Boolean(user.approved ?? true),
      mfaRequired: Boolean(user.mfaRequired),
      groups: groups
        .filter((group) => wanted.has(String(group.name)))
        .map((group) => ({ id: group.id, name: group.name })),
      customClaims: records(user.customClaims ?? []).map((claim) => ({
        claim: claim.claim,
        value: claim.value,
      })),
    },
  );
}

/** The first-run password link VoidAuth logs: `${APP_URL}/reset_password?id=…&challenge=…`. */
export function parseFirstRunLink(log: string): {
  userId: string;
  challenge: string;
} {
  const link = /https:\/\/\S+\/reset_password\?id=[\w-]+&challenge=[\w-]+/.exec(
    log,
  )?.[0];
  if (!link) throw new Error("VoidAuth's log holds no first-run link");
  const params = new URL(link).searchParams;
  return {
    userId: params.get("id") ?? "",
    challenge: params.get("challenge") ?? "",
  };
}
