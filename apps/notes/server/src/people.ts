import type { DatabaseSync } from "node:sqlite";

export type Role = "owner" | "member" | "guest";

export interface Person {
  id: string;
  role: Role;
  name: string | null;
}

/** Who VoidAuth says signed in. */
export interface Identity {
  sub: string;
  name: string | null;
  /** In VoidAuth's `auth_admins` group (ADR-PLAT-004). */
  isInstanceAdmin: boolean;
}

/** The people Notes admits (ADR-NOTE-009). A VoidAuth account alone admits no one. */
export class People {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  get(id: string): Person | undefined {
    return this.#db
      .prepare("SELECT id, role, name FROM people WHERE id = ?")
      .get(id) as Person | undefined;
  }

  /**
   * Admits a signed-in identity, or returns undefined to refuse it. Someone already in is admitted,
   * with their name kept in step with VoidAuth. While nobody is in, the first VoidAuth admin becomes
   * the first owner.
   */
  admit(identity: Identity): Person | undefined {
    const existing = this.get(identity.sub);
    if (existing) {
      this.#db
        .prepare("UPDATE people SET name = ? WHERE id = ?")
        .run(identity.name, identity.sub);
      return { ...existing, name: identity.name };
    }
    if (!identity.isInstanceAdmin) return undefined;
    // One statement, so two first sign-ins at once cannot both become the first owner.
    const inserted = this.#db
      .prepare(
        `INSERT INTO people (id, role, name, created_at)
         SELECT ?, 'owner', ?, ? WHERE NOT EXISTS (SELECT 1 FROM people)`,
      )
      .run(identity.sub, identity.name, Date.now());
    return inserted.changes === 1
      ? { id: identity.sub, role: "owner", name: identity.name }
      : undefined;
  }
}
