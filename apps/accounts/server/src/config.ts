import type { GatewayAddress } from "@homelab/app-manifests";

// The install's settings, from environment variables, for now read directly (issue #40).

export interface Config {
  /** The parent domain every app lives under, e.g. `home.example` (ADR-PLAT-004). */
  domain: string;
  /**
   * Where people reach this service through the gateway, e.g. `https://accounts.home.example`.
   * Its port, if any, is every app's port.
   */
  accountsUrl: string;
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
  const domain = required(env, "HOMELAB_DOMAIN");
  const testSignInLinks = env.TEST_SIGN_IN_LINKS === "on";
  if (testSignInLinks && env.NODE_ENV === "production")
    throw new Error("TEST_SIGN_IN_LINKS can't be on in production");
  return {
    domain,
    accountsUrl: env.ACCOUNTS_URL ?? `https://accounts.${domain}`,
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
