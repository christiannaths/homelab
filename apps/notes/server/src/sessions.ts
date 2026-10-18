import { createHash, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { integer, text } from "./rows.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** ADR-NOTE-009: a device session lasts a year and is extended on use, at most once a day. */
export const SESSION_LIFETIME_MS = 365 * DAY_MS;
const RENEW_AFTER_MS = DAY_MS;

export const SESSION_COOKIE = "notes_session";

export interface Session {
  /** Identifies the session without revealing its token: the hash stored in place of it. */
  id: string;
  token: string;
  personId: string;
}

/** The id of the session a token belongs to. */
export const sessionId = (token: string) =>
  createHash("sha256").update(token).digest("base64url");

/** Notes' own device sessions (ADR-NOTE-014). VoidAuth is not involved once one is issued. */
export class Sessions {
  readonly #db: DatabaseSync;
  readonly #now: () => number;

  constructor(db: DatabaseSync, now: () => number = Date.now) {
    this.#db = db;
    this.#now = now;
  }

  /**
   * Starts a session for one device and returns its token, which only the cookie holds.
   * `voidauthSid` is the VoidAuth session it was signed in through, if VoidAuth said.
   */
  issue(personId: string, voidauthSid: string | null = null): string {
    const token = randomBytes(32).toString("base64url");
    const now = this.#now();
    this.#db
      .prepare(
        `INSERT INTO sessions (token_hash, person_id, voidauth_sid, created_at, renewed_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        sessionId(token),
        personId,
        voidauthSid,
        now,
        now,
        now + SESSION_LIFETIME_MS,
      );
    return token;
  }

  /** The session for a cookie's token, extended for another year if it has not been today. */
  use(token: string | undefined): Session | undefined {
    if (!token) return undefined;
    const tokenHash = sessionId(token);
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
    return { id: tokenHash, token, personId: text(row, "person_id") };
  }

  /** Ends one session and returns its id. */
  revoke(token: string): string {
    const id = sessionId(token);
    this.#db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(id);
    return id;
  }

  /** Ends every session issued from one VoidAuth session, and returns their ids. */
  revokeFromVoidAuthSession(voidauthSid: string): string[] {
    return this.#db
      .prepare(
        "DELETE FROM sessions WHERE voidauth_sid = ? RETURNING token_hash",
      )
      .all(voidauthSid)
      .map((row) => text(row, "token_hash"));
  }

  /** Ends every session of one person, and returns their ids. */
  revokeForPerson(personId: string): string[] {
    return this.#db
      .prepare("DELETE FROM sessions WHERE person_id = ? RETURNING token_hash")
      .all(personId)
      .map((row) => text(row, "token_hash"));
  }

  /** The `Set-Cookie` value holding a session token, or clearing it when `token` is empty. */
  cookie(token: string): string {
    const maxAge = token ? SESSION_LIFETIME_MS / 1000 : 0;
    return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
  }
}
