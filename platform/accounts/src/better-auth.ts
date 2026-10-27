// Better Auth keeps the accounts, their passwords and their sessions (ADR-PLAT-004). Only this
// service talks to it; apps see the person through the gateway's Remote-* headers.
import type { DatabaseSync } from "node:sqlite";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import type { Config } from "./config.ts";

const DAY = 60 * 60 * 24;

function optionsFor(db: DatabaseSync, config: Config) {
  return {
    appName: "Homelab",
    database: db,
    baseURL: config.accountsUrl,
    secret: config.secret,
    basePath: "/api/auth",
    trustedOrigins: [config.accountsUrl],
    // Accounts are made by this service itself (test-people.ts now, invites later), so Better
    // Auth's own sign-up stays closed.
    emailAndPassword: { enabled: true, disableSignUp: true },
    user: {
      additionalFields: {
        // Opens no app and adds nothing to Remote-Groups: it lets the person manage people.
        homelabAdmin: {
          type: "boolean",
          required: false,
          defaultValue: false,
          input: false,
        },
      },
    },
    telemetry: { enabled: false },
    session: {
      // Household devices stay signed in, and offline-first apps keep working (ADR-NOTE-009).
      expiresIn: 365 * DAY,
      updateAge: DAY,
      // No cookie cache: the gateway asks about every request, so taking an app away or signing
      // a device out takes effect on the next one.
      cookieCache: { enabled: false },
    },
    advanced: {
      // One session cookie on the parent domain reaches every app's hostname, so one sign-in and
      // one sign-out cover them all.
      crossSubDomainCookies: { enabled: true, domain: config.domain },
      cookiePrefix: "homelab",
      useSecureCookies: true,
      // accounts.ts puts the address the gateway saw here, so a browser can't pick its own
      // rate-limit bucket.
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      customRules: { "/sign-in/email": config.signInRateLimit },
    },
  } satisfies BetterAuthOptions;
}

export async function createBetterAuth(db: DatabaseSync, config: Config) {
  const options = optionsFor(db, config);
  // Before Better Auth starts, which otherwise logs a schema mismatch error on an empty database.
  const { runMigrations } = await getMigrations(options);
  await runMigrations();
  return betterAuth(options);
}

export type BetterAuth = Awaited<ReturnType<typeof createBetterAuth>>;
