// What Home's server says about the signed-in person (platform/home/server/README.md).

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
 * Asks who is signed in. A signed-out browser gets the gateway's redirect to sign in instead of
 * an answer; it is not followed, since only a page load can sign in.
 */
export async function checkMe(): Promise<MeCheck> {
  let response: Response;
  try {
    response = await fetch("/api/me", {
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    return { status: "unreachable" };
  }
  if (response.type === "opaqueredirect") return { status: "signed-out" };
  // A 401 means no gateway is in front of Home; treated as signed out, the sign-in would come
  // straight back here.
  if (!response.ok) return { status: "unreachable" };
  const me = parseMe(await response.json().catch(() => undefined));
  return me ? { status: "signed-in", me } : { status: "unreachable" };
}

/** A page load the service worker leaves to the network, so it reaches the gateway. */
export const SIGN_IN_PATH = "/api/sign-in";
