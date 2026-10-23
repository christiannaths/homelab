// Who is signed in, as the homelab gateway says: it asks the accounts service about every request
// and copies its answer into these headers, after deleting any the browser sent (ADR-PLAT-004).
// Only the gateway reaches an app, so the headers are trusted as they are.

/** The person on a request that came through the gateway. */
export interface GatewayIdentity {
  /** The person's account id, which never changes, even when their email or name does. */
  id: string;
  name: string | null;
  email: string | null;
  /** Their App access: `<app>` for a member, `<app>-admins` for an admin. */
  groups: string[];
}

/** Undefined when there is no `Remote-User`: the request did not come through the gateway. */
export function identityFrom(headers: Headers): GatewayIdentity | undefined {
  const id = decoded(headers.get("remote-user"));
  if (!id) return undefined;
  return {
    id,
    name: decoded(headers.get("remote-name")),
    email: decoded(headers.get("remote-email")),
    groups: (headers.get("remote-groups") ?? "")
      .split(",")
      .map((group) => decoded(group.trim()))
      .filter((group) => group !== null),
  };
}

// The accounts service percent-encodes a value only when it cannot be sent as a raw header.
function decoded(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
