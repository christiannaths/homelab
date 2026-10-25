// The gateway's question about every request to an app (packages/gateway/signed-in.caddyfile):
// Caddy's forward_auth sends the browser's cookies, and the app's address as X-Forwarded-*. A 2xx
// lets the request through with the Remote-* headers below; anything else goes to the browser.
import { groupsOf, type Grants } from "./app-access.ts";

/** Who the session belongs to, as far as the gateway's answer needs. */
export interface Person {
  id: string;
  email: string;
  name: string;
  grants: Grants;
}

export interface Forwarded {
  proto: string;
  host: string;
  uri: string;
}

export interface Site {
  domain: string;
  accountsUrl: string;
  /** The installed apps' subdomains. */
  apps: readonly string[];
}

export type Answer =
  | { kind: "allow"; headers: Record<string, string> }
  | { kind: "sign-in"; location: string }
  /** `app` is the app's subdomain, or the whole hostname when it isn't an app's. */
  | { kind: "no-access"; app: string };

/** Home lists each person's apps, so every account opens it. */
const HOME = "home";

/** The app's id is its subdomain: `notes.home.example` is `notes` (ADR-PLAT-004). */
export function appOf(host: string, domain: string): string | undefined {
  const hostname = host.replace(/:\d+$/, "").toLowerCase();
  const suffix = `.${domain.toLowerCase()}`;
  if (!hostname.endsWith(suffix)) return undefined;
  const app = hostname.slice(0, -suffix.length);
  return app && !app.includes(".") ? app : undefined;
}

export function answer(
  person: Person | undefined,
  forwarded: Forwarded,
  site: Site,
): Answer {
  if (!person) {
    return {
      kind: "sign-in",
      location: signInUrl(
        site.accountsUrl,
        `${forwarded.proto}://${forwarded.host}${forwarded.uri}`,
      ),
    };
  }
  const app = appOf(forwarded.host, site.domain);
  // A hostname that isn't one installed app under the domain fails closed.
  const opens =
    app === HOME ||
    (app !== undefined &&
      site.apps.includes(app) &&
      Object.hasOwn(person.grants, app));
  if (!opens) return { kind: "no-access", app: app ?? forwarded.host };
  return {
    kind: "allow",
    headers: {
      // The account id, not the email: a person's email may change, and apps key their data by
      // this.
      "Remote-User": person.id,
      "Remote-Email": headerValue(person.email),
      "Remote-Name": headerValue(person.name),
      "Remote-Groups": groupsOf(person.grants).join(","),
    },
  };
}

// Percent-encoded only when it can't go as a raw header, so packages/gateway/src/identity.ts
// reads both the same way.
function headerValue(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) && !value.includes("%")
    ? value
    : encodeURIComponent(value);
}

/** The sign-in page, which comes back to `returnTo` (an address, or a path on this site). */
export function signInUrl(accountsUrl: string, returnTo: string): string {
  const url = new URL("/sign-in", accountsUrl);
  url.searchParams.set("return-to", new URL(returnTo, accountsUrl).href);
  return url.href;
}

/**
 * Where to send a person after signing in: an https address on the homelab's domain, or the
 * account page. Anything else would make the sign-in page an open redirect.
 */
export function safeReturnTo(
  value: string | undefined,
  { domain, accountsUrl }: Pick<Site, "domain" | "accountsUrl">,
): string {
  const accountPage = new URL("/", accountsUrl).href;
  if (!value) return accountPage;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return accountPage;
  }
  const hostname = url.hostname.toLowerCase();
  const onDomain = hostname === domain || hostname.endsWith(`.${domain}`);
  return url.protocol === "https:" && onDomain && !url.username && !url.password
    ? url.href
    : accountPage;
}
