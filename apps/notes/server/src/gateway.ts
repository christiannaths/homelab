// Who is signed in, as the homelab gateway says: it asks VoidAuth about every request and copies
// VoidAuth's answer into these headers, after deleting any the browser sent (ADR-PLAT-004). Only
// the gateway reaches Notes, so the headers are trusted as they are.

/** The person on a request that came through the gateway. */
export interface GatewayIdentity {
  username: string;
  name: string | null;
  groups: string[];
}

/** Undefined when there is no `Remote-User`: the request did not come through the gateway. */
export function identityFrom(headers: Headers): GatewayIdentity | undefined {
  const username = decoded(headers.get("remote-user"));
  if (!username) return undefined;
  return {
    username,
    name: decoded(headers.get("remote-name")),
    groups: (headers.get("remote-groups") ?? "")
      .split(",")
      .map((group) => decoded(group.trim()))
      .filter((group) => group !== null),
  };
}

// VoidAuth percent-encodes a value only when it cannot be sent as a raw header.
function decoded(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
