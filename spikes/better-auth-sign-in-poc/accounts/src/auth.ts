import type { DatabaseSync } from "node:sqlite";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { twoFactor } from "better-auth/plugins";
import type { Config } from "./config.ts";

const DAY = 60 * 60 * 24;

export function createAuth(db: DatabaseSync, config: Config) {
  return betterAuth({
    appName: "Homelab",
    database: db,
    baseURL: config.accountsUrl,
    secret: config.secret,
    basePath: "/api/auth",
    trustedOrigins: [config.accountsUrl],
    // Email is the sign-in identifier. Accounts come only from invites, which create them through
    // the internal adapter, so Better Auth's own sign-up stays closed.
    emailAndPassword: { enabled: true, disableSignUp: true },
    user: {
      additionalFields: {
        // The apps this person may open, as `<app>` or `<app>-admins` (ADR-PLAT-004). Only the
        // admin endpoints change it, never the person.
        groups: {
          type: "string",
          required: false,
          defaultValue: "",
          input: false,
        },
      },
    },
    plugins: [
      // The passkey belongs to the parent domain, so a later in-app ceremony on notes.<domain>
      // could use the same credential.
      passkey({
        rpID: config.domain,
        rpName: "Homelab",
        origin: config.accountsUrl,
      }),
      twoFactor({ issuer: "Homelab" }),
    ],
    telemetry: { enabled: false },
    session: {
      // Offline-first apps keep a person signed in for a long time (ADR-NOTE-009).
      expiresIn: 365 * DAY,
      updateAge: DAY,
    },
    advanced: {
      // One session cookie on the parent domain reaches every app's hostname, so one sign-in and
      // one sign-out cover them all.
      crossSubDomainCookies: { enabled: true, domain: config.domain },
      cookiePrefix: "homelab",
      useSecureCookies: true,
      // The gateway replaces X-Forwarded-For with the address it saw, so a browser can't pick its
      // own rate-limit bucket.
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      customRules: {
        "/sign-in/email": config.signInRateLimit,
        "/two-factor/verify-totp": config.signInRateLimit,
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

export async function migrateAuth(auth: Auth): Promise<void> {
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
}

/** The groups stored on a user, as a list. */
export function groupsOf(user: { groups?: string | null }): string[] {
  return (user.groups ?? "")
    .split(",")
    .map((group) => group.trim())
    .filter(Boolean);
}
