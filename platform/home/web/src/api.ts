// What the accounts site's `/api/me` says about the signed-in person and their apps
// (platform/accounts/README.md), asked from Home's page with the homelab's cookie.

export interface App {
  id: string;
  url: string;
  name: string;
  icon: string | null;
  opensOffline: boolean;
}

export interface Me {
  person: { id: string; name: string | null; email: string | null };
  signOutUrl: string;
  apps: App[];
}

export type MeCheck =
  | { status: "signed-in"; me: Me }
  | { status: "signed-out" }
  /** No answer from the server: the device is offline, as far as Home can tell. */
  | { status: "unreachable" };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

export function parseMe(value: unknown): Me | undefined {
  if (!isRecord(value) || !isRecord(value.person)) return undefined;
  const { person, signOutUrl, apps } = value;
  if (typeof person.id !== "string" || typeof signOutUrl !== "string")
    return undefined;
  if (!Array.isArray(apps)) return undefined;
  return {
    person: {
      id: person.id,
      name: stringOrNull(person.name),
      email: stringOrNull(person.email),
    },
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
 * The accounts site, `accounts.` beside Home under the parent domain (ADR-PLAT-004), on Home's own
 * scheme and port.
 */
function accountsOrigin(): string {
  const parent = location.host.split(".").slice(1).join(".");
  return `${location.protocol}//accounts.${parent}`;
}

/**
 * Asks the accounts site who is signed in. It is outside the gateway's sign-in check, so a
 * signed-out browser gets a 401 it can read; signing in is left to a page load.
 */
export async function checkMe(): Promise<MeCheck> {
  let response: Response;
  try {
    response = await fetch(`${accountsOrigin()}/api/me`, {
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    return { status: "unreachable" };
  }
  if (response.status === 401) return { status: "signed-out" };
  if (!response.ok) return { status: "unreachable" };
  const me = parseMe(await response.json().catch(() => undefined));
  return me ? { status: "signed-in", me } : { status: "unreachable" };
}

/** A page load the service worker leaves to the network, so it reaches the gateway. */
export const SIGN_IN_PATH = "/api/sign-in";
