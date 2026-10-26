// The Notes server's HTTP API, as the client uses it (apps/notes/server/README.md).

export interface Person {
  id: string;
  name: string | null;
}

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
 * sign in instead of an answer (ADR-NOTE-014); it is not followed, since only a page load can
 * sign in.
 */
export const askSession = (): Promise<Response> =>
  fetch("/api/session", { cache: "no-store", redirect: "manual" });

export function readSession(body: unknown): Person | undefined {
  return isRecord(body) ? parsePerson(body.person) : undefined;
}

/** A page load the service worker leaves to the network, so it reaches the gateway. */
export const SIGN_IN_PATH = "/api/sign-in";
