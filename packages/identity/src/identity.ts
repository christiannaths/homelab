// Both ends of the identity headers (ADR-PLAT-009): the accounts service writes them in its
// answer to the gateway's sign-in check, and the gateway copies them onto every request to an
// app, after deleting any the browser sent (ADR-PLAT-004). Only the gateway reaches an app, so
// an app trusts the headers as they are.

/** A person's level in one app. */
export type Level = "member" | "admin";

/** A person's App access: their level in each app they may open, by app id (its subdomain). */
export type AppAccess = Readonly<Record<string, Level>>;

/** The person on a request that came through the gateway. */
export interface Identity {
  /**
   * The person's account id, which never changes, even when their email or name does: an app
   * keys their data by this, never the email.
   */
  id: string;
  name: string | null;
  email: string | null;
  access: AppAccess;
}

const ADMINS = "-admins";

/** The headers that tell an app who is there. All four are always written. */
export function identityHeaders(person: Identity): Record<string, string> {
  return {
    "Remote-User": headerValue(person.id),
    "Remote-Email": headerValue(person.email ?? ""),
    "Remote-Name": headerValue(person.name ?? ""),
    "Remote-Groups": Object.entries(person.access)
      .toSorted(([a], [b]) => a.localeCompare(b))
      .flatMap(([app, level]) => {
        if (level === "admin") return [headerValue(`${app}${ADMINS}`)];
        if (level === "member") return [headerValue(app)];
        // Callers outside TypeScript can pass anything; no group is safer than a guessed one.
        return [];
      })
      .join(","),
  };
}

/** Undefined when there is no `Remote-User`: the request did not come through the gateway. */
export function identityFrom(headers: Headers): Identity | undefined {
  const id = decoded(headers.get("remote-user"));
  if (!id) return undefined;
  const levels = new Map<string, Level>();
  for (const raw of (headers.get("remote-groups") ?? "").split(",")) {
    const group = decoded(raw.trim());
    if (!group) continue;
    if (group.endsWith(ADMINS) && group.length > ADMINS.length)
      levels.set(group.slice(0, -ADMINS.length), "admin");
    else if (!levels.has(group)) levels.set(group, "member");
  }
  return {
    id,
    name: decoded(headers.get("remote-name")),
    email: decoded(headers.get("remote-email")),
    // fromEntries, so an app called `__proto__` is an entry rather than the object's prototype.
    access: Object.fromEntries(levels),
  };
}

// Percent-encoded only when it can't go as a raw header, so most values stay readable on the
// wire. A raw `%` would be mistaken for an encoding, so it forces one too.
function headerValue(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) && !value.includes("%")
    ? value
    : encodeURIComponent(value);
}

function decoded(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
