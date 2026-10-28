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

/**
 * Makes a workspace owned by the signed-in person and returns its id. Needs a connection, since
 * membership is server data; rejects if the server can't be reached or refuses.
 */
export async function createWorkspace(name: string): Promise<string> {
  const response = await fetch("/api/workspaces", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
    redirect: "manual",
  });
  const body: unknown = response.ok ? await response.json() : undefined;
  const workspace = isRecord(body) ? body.workspace : undefined;
  if (!isRecord(workspace) || typeof workspace.id !== "string")
    throw new Error(`Creating a workspace failed (${response.status})`);
  return workspace.id;
}

/** A page load the service worker leaves to the network, so it reaches the gateway. */
export const SIGN_IN_PATH = "/api/sign-in";
