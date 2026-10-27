// What the accounts site's `/api/me` says about the signed-in person (platform/accounts/README.md),
// asked from the app's own page with the homelab's cookie.

export interface App {
  id: string;
  url: string;
  name: string;
  icon: string | null;
  opensOffline: boolean;
}

export interface Me {
  person: { id: string; name: string | null; email: string | null };
  /** The person's account page on the accounts site. */
  accountUrl: string;
  signOutUrl: string;
  apps: App[];
}

export type Answer =
  | { status: "signed-in"; me: Me }
  | { status: "signed-out" }
  /** The accounts site gave no answer: the device is offline, or the site is down. */
  | { status: "unreachable" };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

export function parseMe(value: unknown): Me | undefined {
  if (!isRecord(value) || !isRecord(value.person)) return undefined;
  const { person, accountUrl, signOutUrl, apps } = value;
  if (
    typeof person.id !== "string" ||
    typeof accountUrl !== "string" ||
    typeof signOutUrl !== "string"
  )
    return undefined;
  if (!Array.isArray(apps)) return undefined;
  return {
    person: {
      id: person.id,
      name: stringOrNull(person.name),
      email: stringOrNull(person.email),
    },
    accountUrl,
    signOutUrl,
    apps: apps.filter(isRecord).flatMap((app) =>
      typeof app.id === "string" &&
      typeof app.url === "string" &&
      typeof app.name === "string"
        ? [
            {
              id: app.id,
              url: app.url,
              name: app.name,
              icon: stringOrNull(app.icon),
              opensOffline: app.opensOffline === true,
            },
          ]
        : [],
    ),
  };
}

/**
 * The accounts site's address: every app is `<app>.<parent domain>`, and the accounts site is
 * `accounts.` (ADR-PLAT-004).
 */
export function accountsOrigin(location: {
  protocol: string;
  host: string;
}): string {
  const parent = location.host.split(".").slice(1).join(".");
  return `${location.protocol}//accounts.${parent}`;
}

/**
 * Asks the accounts site who is signed in. It is outside the gateway's sign-in check, so a
 * signed-out browser gets a 401 it can read; signing in is left to the app.
 */
export async function ask(accounts: string): Promise<Answer> {
  let response: Response;
  try {
    response = await fetch(`${accounts}/api/me`, {
      credentials: "include",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { status: "unreachable" };
  }
  if (response.status === 401) return { status: "signed-out" };
  if (!response.ok) return { status: "unreachable" };
  const me = parseMe(await response.json().catch(() => undefined));
  return me ? { status: "signed-in", me } : { status: "unreachable" };
}

/**
 * Extends the person's session, cookie included, which the gateway's check on each request can't
 * do (ADR-PLAT-004). Signed in, the switcher sends it on every load, so a session in use never
 * runs out. The accounts service is at `accountUrl`, where the person's account page is.
 */
export function keepSessionGoing(accountUrl: string): void {
  void fetch(new URL("/session", accountUrl), {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {
    // Offline or unreachable: the session goes on until a later load reaches the service.
  });
}
