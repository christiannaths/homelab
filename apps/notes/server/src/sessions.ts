import { createHash, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { integer, text } from "./rows.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** ADR-NOTE-009: a device session lasts a year and is extended on use, at most once a day. */
export const SESSION_LIFETIME_MS = 365 * DAY_MS;
const RENEW_AFTER_MS = DAY_MS;

export const SESSION_COOKIE = "notes_session";

export interface Session {
  token: string;
  personId: string;
}

const hash = (token: string) =>
  createHash("sha256").update(token).digest("base64url");

/** Notes' own device sessions (ADR-NOTE-014). VoidAuth is not involved once one is issued. */
export class Sessions {
  readonly #db: DatabaseSync;
  readonly #now: () => number;

  constructor(db: DatabaseSync, now: () => number = Date.now) {
    this.#db = db;
    this.#now = now;
  }

  /** Starts a session for one device and returns its token, which only the cookie holds. */
  issue(personId: string): string {
    const token = randomBytes(32).toString("base64url");
    const now = this.#now();
    this.#db
      .prepare(
        `INSERT INTO sessions (token_hash, person_id, created_at, renewed_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(hash(token), personId, now, now, now + SESSION_LIFETIME_MS);
    return token;
  }

  /** The session for a cookie's token, extended for another year if it has not been today. */
  use(token: string | undefined): Session | undefined {
    if (!token) return undefined;
    const tokenHash = hash(token);
    const row = this.#db
      .prepare(
        "SELECT person_id, renewed_at, expires_at FROM sessions WHERE token_hash = ?",
      )
      .get(tokenHash);
    if (!row) return undefined;
    const now = this.#now();
    if (integer(row, "expires_at") <= now) {
      this.#db
        .prepare("DELETE FROM sessions WHERE token_hash = ?")
        .run(tokenHash);
      return undefined;
    }
    if (now - integer(row, "renewed_at") >= RENEW_AFTER_MS) {
      this.#db
        .prepare(
          "UPDATE sessions SET renewed_at = ?, expires_at = ? WHERE token_hash = ?",
        )
        .run(now, now + SESSION_LIFETIME_MS, tokenHash);
    }
    return { token, personId: text(row, "person_id") };
  }

  revoke(token: string): void {
    this.#db
      .prepare("DELETE FROM sessions WHERE token_hash = ?")
      .run(hash(token));
  }

  /** The `Set-Cookie` value holding a session token, or clearing it when `token` is empty. */
  cookie(token: string): string {
    const maxAge = token ? SESSION_LIFETIME_MS / 1000 : 0;
    return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
  }
}
