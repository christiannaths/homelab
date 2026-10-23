// Invite links: the only way an account is made. An invite carries the apps the admin grants, so
// the new person can open them as soon as they've set a password.
import { createHash, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface Invite {
  groups: string[];
  /** Set when the admin invited a particular address; otherwise the person types their own. */
  email: string | null;
}

export class Invites {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
    db.exec(`CREATE TABLE IF NOT EXISTS invite (
      token_hash TEXT PRIMARY KEY,
      groups TEXT NOT NULL,
      email TEXT,
      expires_at INTEGER NOT NULL,
      used_at INTEGER
    )`);
  }

  /** Returns the token for the link. Only its hash is stored, so a copy of the database can't use it. */
  create(invite: Invite, now = Date.now()): string {
    const token = randomBytes(32).toString("base64url");
    this.db
      .prepare(
        "INSERT INTO invite (token_hash, groups, email, expires_at) VALUES (?, ?, ?, ?)",
      )
      .run(hash(token), invite.groups.join(","), invite.email, now + WEEK_MS);
    return token;
  }

  /** The invite behind a token, if it exists, is unused and hasn't expired. */
  find(token: string, now = Date.now()): Invite | undefined {
    const row = this.db
      .prepare(
        "SELECT groups, email FROM invite WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?",
      )
      .get(hash(token), now);
    if (!row || typeof row.groups !== "string") return undefined;
    return {
      groups: row.groups ? row.groups.split(",") : [],
      email: typeof row.email === "string" ? row.email : null,
    };
  }

  /** Marks the invite used. False when another request used it first. */
  use(token: string, now = Date.now()): boolean {
    const { changes } = this.db
      .prepare(
        "UPDATE invite SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?",
      )
      .run(now, hash(token), now);
    return changes === 1;
  }
}

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
