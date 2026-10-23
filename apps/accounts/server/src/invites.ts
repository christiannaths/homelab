// Invites (ADR-PLAT-004): the only way a person gets an account on a real install. A homelab admin
// makes one for an email with the App access it grants, and passes its link on themselves, since
// the homelab sends no email.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { isLevel, type Grants } from "./app-access.ts";

/** How long an invite's link works. */
export const INVITE_LIFETIME = 7 * 24 * 60 * 60 * 1000;

export interface Invite {
  id: string;
  /**
   * The only email that can join with it, stored lowercase. None for the setup invite, whose
   * person types their own: on an empty install there is nobody to have typed it.
   */
  email: string | null;
  grants: Grants;
  homelabAdmin: boolean;
  expiresAt: Date;
}

export class Invites {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
    // Only the token's hash is kept, so the database alone can't be used to join. Removing the
    // admin who made an invite removes it too.
    db.exec(`CREATE TABLE IF NOT EXISTS invite (
      id            TEXT PRIMARY KEY,
      token_hash    TEXT NOT NULL UNIQUE,
      email         TEXT,
      apps          TEXT NOT NULL,
      homelab_admin INTEGER NOT NULL,
      made_by       TEXT REFERENCES "user" (id) ON DELETE CASCADE,
      expires_at    INTEGER NOT NULL
    )`);
  }

  /**
   * Makes an invite and returns the token for its link, which is never stored and can't be shown
   * again.
   */
  make(invite: {
    email: string | null;
    grants: Grants;
    homelabAdmin?: boolean;
    madeBy: string | null;
  }): string {
    const token = randomBytes(32).toString("base64url");
    this.#db
      .prepare(
        `INSERT INTO invite (id, token_hash, email, apps, homelab_admin, made_by, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        hashOf(token),
        invite.email,
        JSON.stringify(invite.grants),
        invite.homelabAdmin ? 1 : 0,
        invite.madeBy,
        Date.now() + INVITE_LIFETIME,
      );
    return token;
  }

  /** The invites people can still join with, soonest to expire first. The setup invite is left out. */
  pending(): Invite[] {
    return this.#db
      .prepare(
        "SELECT * FROM invite WHERE email IS NOT NULL AND expires_at > ? ORDER BY expires_at",
      )
      .all(Date.now())
      .map(inviteOf);
  }

  /** The invite a link's token belongs to, while it can still be used. */
  find(token: string): Invite | undefined {
    const row = this.#db
      .prepare("SELECT * FROM invite WHERE token_hash = ? AND expires_at > ?")
      .get(hashOf(token), Date.now());
    const invite = row && inviteOf(row);
    return invite && this.#usable(invite) ? invite : undefined;
  }

  /**
   * Takes the invite a link's token belongs to, while it can still be used, so that no other
   * request can join with it.
   */
  take(token: string): Invite | undefined {
    const invite = this.find(token);
    if (!invite) return undefined;
    // Two people joining at once with the same link: only one of them deletes it.
    const taken = this.#db
      .prepare("DELETE FROM invite WHERE id = ?")
      .run(invite.id);
    return taken.changes === 1 ? invite : undefined;
  }

  /** Cancels a pending invite. False when there is none with that id. */
  cancel(id: string): boolean {
    return (
      this.#db
        .prepare("DELETE FROM invite WHERE id = ? AND email IS NOT NULL")
        .run(id).changes === 1
    );
  }

  /**
   * On an install with no accounts, a fresh invite that makes a homelab admin, replacing any
   * earlier one. Returns its token, or nothing once anyone has an account.
   */
  setup(): string | undefined {
    if (this.#anyAccount()) return undefined;
    this.#db.prepare("DELETE FROM invite WHERE email IS NULL").run();
    return this.make({
      email: null,
      grants: {},
      homelabAdmin: true,
      madeBy: null,
    });
  }

  // A setup invite printed in a log could otherwise make a homelab admin on a running install.
  #usable(invite: Invite): boolean {
    return invite.email !== null || !this.#anyAccount();
  }

  #anyAccount(): boolean {
    return this.#db.prepare('SELECT 1 FROM "user" LIMIT 1').get() !== undefined;
  }
}

function hashOf(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function inviteOf(row: Record<string, unknown>): Invite {
  const grants: Grants = {};
  const apps: unknown = JSON.parse(String(row.apps));
  if (typeof apps === "object" && apps !== null)
    for (const [app, level] of Object.entries(apps))
      if (isLevel(level)) grants[app] = level;
  return {
    id: String(row.id),
    email: typeof row.email === "string" ? row.email : null,
    grants,
    homelabAdmin: row.homelab_admin === 1,
    expiresAt: new Date(Number(row.expires_at)),
  };
}
