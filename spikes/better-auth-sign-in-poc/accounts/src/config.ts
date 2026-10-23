export interface Config {
  /** The parent domain every app lives under, e.g. `home.example` (ADR-PLAT-004). */
  domain: string;
  /** Where people reach this service through the gateway, e.g. `https://accounts.home.example`. */
  accountsUrl: string;
  secret: string;
  dataDir: string;
  port: number;
  /** Sign-in attempts allowed per client address in each window. */
  signInRateLimit: { window: number; max: number };
}

export function configFromEnv(env: NodeJS.ProcessEnv): Config {
  const domain = required(env, "HOMELAB_DOMAIN");
  return {
    domain,
    accountsUrl: env.ACCOUNTS_URL ?? `https://accounts.${domain}`,
    secret: required(env, "BETTER_AUTH_SECRET"),
    dataDir: env.DATA_DIR ?? "data",
    port: Number(env.PORT ?? 3000),
    signInRateLimit: {
      window: Number(env.SIGN_IN_RATE_WINDOW ?? 60),
      max: Number(env.SIGN_IN_RATE_MAX ?? 5),
    },
  };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
}
