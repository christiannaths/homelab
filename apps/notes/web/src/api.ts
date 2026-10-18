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

/** Asks who is signed in on this device, which also renews the device session. */
export async function checkSession(): Promise<SessionCheck> {
  let response: Response;
  try {
    response = await fetch("/api/session", { cache: "no-store" });
  } catch {
    return { status: "unreachable" };
  }
  if (response.status === 401) return { status: "signed-out" };
  if (!response.ok) return { status: "unreachable" };
  const body: unknown = await response.json().catch(() => undefined);
  const person = isRecord(body) ? parsePerson(body.person) : undefined;
  return person ? { status: "signed-in", person } : { status: "unreachable" };
}

/** Where the browser goes to sign in with the homelab account. */
export const SIGN_IN_PATH = "/api/sign-in";

/**
 * Ends this device's Notes session and returns VoidAuth's end-session address, where the browser
 * goes next to sign out of the homelab account. Undefined when the server could not be reached.
 */
export async function signOutOfNotes(): Promise<string | undefined> {
  try {
    const response = await fetch("/api/sign-out", { method: "POST" });
    if (!response.ok) return undefined;
    const body: unknown = await response.json();
    return isRecord(body) && typeof body.endSessionUrl === "string"
      ? body.endSessionUrl
      : undefined;
  } catch {
    return undefined;
  }
}
