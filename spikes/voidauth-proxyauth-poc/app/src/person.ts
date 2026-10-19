// Who is signed in, read from the headers the gateway copies from VoidAuth's ProxyAuth answer.
// Only the gateway can reach the app, and it replaces these headers on every request, so the app
// trusts them without checking anything itself.

export type Level = "admin" | "member";

export interface Person {
  username: string;
  name: string | null;
  email: string | null;
  groups: string[];
  level: Level;
}

type Headers = Record<string, string | string[] | undefined>;

/**
 * The person on a request, or null when the gateway sent no Remote-User (a request that did not
 * come through the gateway). VoidAuth already refused people outside the app's groups, so the
 * groups here only set the level: `<app>-admins` is admin, anyone else let in is a member.
 */
export function personFrom(headers: Headers, appId: string): Person | null {
  const username = header(headers, "remote-user");
  if (!username) return null;
  const groups = (header(headers, "remote-groups") ?? "")
    .split(",")
    .map((g) => decodeURIComponent(g.trim()))
    .filter(Boolean);
  return {
    username: decodeURIComponent(username),
    name: decoded(header(headers, "remote-name")),
    email: decoded(header(headers, "remote-email")),
    groups,
    level: groups.includes(`${appId}-admins`) ? "admin" : "member",
  };
}

function header(headers: Headers, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

// VoidAuth percent-encodes a value only when it can't be sent as a raw header.
function decoded(value: string | undefined): string | null {
  return value ? decodeURIComponent(value) : null;
}
