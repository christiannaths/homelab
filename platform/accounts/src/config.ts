import type { GatewayAddress } from "@homelab/app-manifests";

// The install's settings, from environment variables, for now read directly (issue #40).

/** Where the homelab is, all derived from HOMELAB_URL (ADR-PLAT-004). */
export interface HomelabAddresses {
  /**
   * The parent address every app is a subdomain of, e.g. `https://homelab.localhost:8443/`. Its
   * port, if any, is every app's port.
   */
  homelabUrl: URL;
  /** The parent domain, e.g. `homelab.localhost`, which the session cookie is set on. */
  domain: string;
  /** Where people reach this service through the gateway, e.g. `https://accounts.home.example`. */
  accountsUrl: string;
}

export interface Config extends HomelabAddresses {
  /** Signs session cookies. At least 32 characters. */
  secret: string;
  dataDir: string;
  port: number;
  /**
   * The installed apps, by subdomain: the only apps App access can name. Home is open to every
   * account and is not listed.
   */
  apps: string[];
  /** How to reach the gateway to read apps' manifests. By default, at each app's address. */
  gateway: GatewayAddress;
  /** Sign-in attempts allowed per client address in each window, in seconds. */
  signInRateLimit: { window: number; max: number };
  /**
   * Answers `/test-sign-in`, which signs a browser in as any person by email with no password, for
   * the links `npm run dev` prints. Never on an install or a preview.
   */
  testSignInLinks?: boolean;
}

export function configFromEnv(env: NodeJS.ProcessEnv): Config {
  const addresses = homelabAddresses(required(env, "HOMELAB_URL"));
  const testSignInLinks = env.TEST_SIGN_IN_LINKS === "on";
  if (testSignInLinks && env.NODE_ENV === "production")
    throw new Error("TEST_SIGN_IN_LINKS can't be on in production");
  return {
    ...addresses,
    secret: required(env, "ACCOUNTS_SECRET"),
    dataDir: env.DATA_DIR ?? "data",
    port: Number(env.PORT ?? 3000),
    apps: installedApps(env.HOMELAB_APPS ?? ""),
    gateway: {
      url: env.GATEWAY_URL ? new URL(env.GATEWAY_URL) : undefined,
      caFile: env.GATEWAY_CA || undefined,
    },
    signInRateLimit: {
      window: Number(env.SIGN_IN_RATE_WINDOW ?? 60),
      max: Number(env.SIGN_IN_RATE_MAX ?? 5),
    },
    testSignInLinks,
  };
}

/** HOMELAB_URL, such as `https://home.example` or `https://homelab.localhost:8443`. */
export function homelabAddresses(setting: string): HomelabAddresses {
  let url: URL | undefined;
  try {
    url = new URL(setting);
  } catch {
    url = undefined;
  }
  // The session cookie is Secure, so the homelab is https only. Apps sit at the root of their own
  // subdomains, so a path would have nowhere to go.
  if (
    url?.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      `HOMELAB_URL must be the homelab's https address, such as https://home.example, not ${setting}`,
    );
  return {
    homelabUrl: url,
    domain: url.hostname,
    accountsUrl: `https://accounts.${url.host}`,
  };
}

/**
 * Whether `url` is on the homelab: the parent address itself, or a subdomain of it, on its scheme
 * and port.
 */
export function onHomelab(url: URL, homelabUrl: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  return (
    url.protocol === homelabUrl.protocol &&
    url.port === homelabUrl.port &&
    (hostname === homelabUrl.hostname ||
      hostname.endsWith(`.${homelabUrl.hostname}`))
  );
}

/** `notes, encyclopedia` as a list of subdomains. */
export function installedApps(setting: string): string[] {
  const apps = setting
    .split(",")
    .map((app) => app.trim().toLowerCase())
    .filter(Boolean);
  for (const app of apps)
    if (!/^[a-z0-9-]+$/.test(app) || app === "home" || app === "accounts")
      throw new Error(`HOMELAB_APPS names ${app}, which can't be an app`);
  return apps;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
}
