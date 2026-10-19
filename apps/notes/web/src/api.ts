// The Notes server's HTTP API, as the client uses it (apps/notes/server/README.md).

export interface Person {
  id: string;
  name: string | null;
}

export type SessionCheck =
  | { status: "signed-in"; person: Person }
  | { status: "signed-out" }
  /** No answer from the server: the device is offline, as far as Notes can tell (ADR-NOTE-001). */
  | { status: "unreachable" };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function parsePerson(value: unknown): Person | undefined {
  if (!isRecord(value) || typeof value.id !== "string") return undefined;
  return {
    id: value.id,
    name: typeof value.name === "string" ? value.name : null,
  };
}

/**
 * Asks who is signed in on this device. A signed-out browser gets the gateway's redirect to
 * VoidAuth instead of an answer (ADR-NOTE-014); it is not followed, since only a page load can
 * sign in.
 */
export async function checkSession(): Promise<SessionCheck> {
  let response: Response;
  try {
    response = await fetch("/api/session", {
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    return { status: "unreachable" };
  }
  if (response.type === "opaqueredirect") return { status: "signed-out" };
  // A 401 means no gateway is in front of Notes. Treated as signed out, the app would start a
  // sign-in that comes straight back here, so it waits as if offline instead.
  if (!response.ok) return { status: "unreachable" };
  const body: unknown = await response.json().catch(() => undefined);
  const person = isRecord(body) ? parsePerson(body.person) : undefined;
  return person ? { status: "signed-in", person } : { status: "unreachable" };
}

/** Page loads the service worker leaves to the network, so they reach the gateway. */
export const SIGN_IN_PATH = "/api/sign-in";
/** Leads to VoidAuth's sign-out page, which signs the homelab account out of every app. */
export const SIGN_OUT_PATH = "/api/sign-out";
