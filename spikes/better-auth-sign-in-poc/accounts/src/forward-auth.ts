// The gateway's question about every request to an app (packages/gateway/signed-in.caddyfile):
// Caddy's forward_auth sends the browser's cookies, and the app's address as X-Forwarded-*. A 2xx
// lets the request through with the Remote-* headers below; anything else goes to the browser.

/** Who the session belongs to, as far as the gateway's answer needs. */
export interface Person {
  id: string;
  email: string;
  name: string;
  groups: string[];
}

export interface Forwarded {
  proto: string;
  host: string;
  uri: string;
}

export type Answer =
  | { kind: "allow"; headers: Record<string, string> }
  | { kind: "sign-in"; location: string }
  | { kind: "no-access"; app: string };

/** The app's id is its subdomain: `notes.home.example` is `notes` (ADR-PLAT-004). */
export function appOf(host: string, domain: string): string | undefined {
  const hostname = host.replace(/:\d+$/, "").toLowerCase();
  const suffix = `.${domain.toLowerCase()}`;
  if (!hostname.endsWith(suffix)) return undefined;
  const app = hostname.slice(0, -suffix.length);
  return app && !app.includes(".") ? app : undefined;
}

/** `<app>` lets a person in as a member, `<app>-admins` as the app's admin. */
export function mayOpen(groups: string[], app: string): boolean {
  return groups.includes(app) || groups.includes(`${app}-admins`);
}

export function answer(
  person: Person | undefined,
  forwarded: Forwarded,
  { domain, accountsUrl }: { domain: string; accountsUrl: string },
): Answer {
  const app = appOf(forwarded.host, domain);
  if (!person) {
    const signIn = new URL("/sign-in", accountsUrl);
    signIn.searchParams.set(
      "return-to",
      `${forwarded.proto}://${forwarded.host}${forwarded.uri}`,
    );
    return { kind: "sign-in", location: signIn.href };
  }
  // A hostname that isn't one app under the domain fails closed.
  if (!app || !mayOpen(person.groups, app))
    return { kind: "no-access", app: app ?? forwarded.host };
  return {
    kind: "allow",
    headers: {
      // The account id, not the email: a person can change their email, and apps key their data
      // by this.
      "Remote-User": person.id,
      "Remote-Email": headerValue(person.email),
      "Remote-Name": headerValue(person.name),
      "Remote-Groups": person.groups.map(headerValue).join(","),
    },
  };
}

// Percent-encoded only when it can't go as a raw header, as VoidAuth does, so
// packages/gateway/src/identity.ts reads both the same way.
function headerValue(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) && !value.includes("%")
    ? value
    : encodeURIComponent(value);
}

/**
 * Where to send a person after signing in: an https address on the homelab's domain, or the
 * account page. Anything else would make the sign-in page an open redirect.
 */
export function safeReturnTo(
  value: string | undefined,
  { domain, accountsUrl }: { domain: string; accountsUrl: string },
): string {
  if (!value) return new URL("/", accountsUrl).href;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const onDomain = hostname === domain || hostname.endsWith(`.${domain}`);
    if (url.protocol === "https:" && onDomain && !url.username && !url.password)
      return url.href;
  } catch {
    // Not a URL.
  }
  return new URL("/", accountsUrl).href;
}
