import type { DatabaseSync } from "node:sqlite";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { admin, username } from "better-auth/plugins";

const DAY = 60 * 60 * 24;

export interface AuthOptions {
  db: DatabaseSync;
  baseURL: string;
  secret: string;
  /** Called after a session row is deleted (sign-out, revocation), so open sync sockets can be closed. */
  onSessionDeleted: (token: string) => void;
}

export function createAuth({ db, baseURL, secret, onSessionDeleted }: AuthOptions) {
  return betterAuth({
    database: db,
    baseURL,
    secret,
    basePath: "/api/auth",
    // ADR 10: no public sign-up. Accounts come from first-run setup or an admin.
    emailAndPassword: { enabled: true, disableSignUp: true },
    plugins: [username(), admin()],
    // ADR 4: no external services. Telemetry is off by default; keep it off explicitly.
    telemetry: { enabled: false },
    session: {
      // ADR 10: a device keeps working offline for a long time without asking for the
      // password again. The session is extended whenever the device syncs.
      expiresIn: 365 * DAY,
      updateAge: DAY,
    },
    // Rate limiting is on by default only in production; turn it on everywhere so the
    // spike can show it. Stored in SQLite so limits survive restarts.
    rateLimit: { enabled: true, storage: "database" },
    databaseHooks: {
      session: {
        delete: {
          after: async (session) => onSessionDeleted(session.token),
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

export async function migrateAuth(auth: Auth): Promise<void> {
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
}

/**
 * Better Auth requires an email on every user, but ADR 10 accounts only have a username.
 * Each account gets a placeholder address on a reserved domain that can never receive mail.
 */
export const placeholderEmail = (username: string) => `${username.toLowerCase()}@users.invalid`;
