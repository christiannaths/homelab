// What Home says about the signed-in person (apps/home/server/README.md), asked from the app's own
// page with the homelab's cookie.

export interface App {
  id: string;
  url: string;
  name: string;
  icon: string | null;
  opensOffline: boolean;
}

export interface Me {
  person: { username: string; name: string | null; email: string | null };
  signOutUrl: string;
  apps: App[];
}

export type Answer =
  | { status: "signed-in"; me: Me }
  | { status: "signed-out" }
  /** Home gave no answer: the device is offline, or Home is down. */
  | { status: "unreachable" };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

export function parseMe(value: unknown): Me | undefined {
  if (!isRecord(value) || !isRecord(value.person)) return undefined;
  const { person, signOutUrl, apps } = value;
  if (typeof person.username !== "string" || typeof signOutUrl !== "string")
    return undefined;
  if (!Array.isArray(apps)) return undefined;
  return {
    person: {
      username: person.username,
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

/** Home's address: every app is `<app>.<parent domain>`, and Home is `home.` (ADR-PLAT-004). */
export function homeOrigin(location: {
  protocol: string;
  host: string;
}): string {
  const parent = location.host.split(".").slice(1).join(".");
  return `${location.protocol}//home.${parent}`;
}

/**
 * Asks Home who is signed in. A signed-out browser gets the gateway's redirect to VoidAuth, which
 * is not followed: signing in is left to the app.
 */
export async function ask(home: string): Promise<Answer> {
  let response: Response;
  try {
    response = await fetch(`${home}/api/me`, {
      credentials: "include",
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { status: "unreachable" };
  }
  if (response.type === "opaqueredirect") return { status: "signed-out" };
  if (!response.ok) return { status: "unreachable" };
  const me = parseMe(await response.json().catch(() => undefined));
  return me ? { status: "signed-in", me } : { status: "unreachable" };
}
