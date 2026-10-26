import type { DatabaseSync } from "node:sqlite";
import type { Identity } from "@homelab/identity";
import { nullableText, text } from "./rows.ts";

const ROLES = ["owner", "member", "guest"] as const;
export type Role = (typeof ROLES)[number];

const isRole = (value: string): value is Role =>
  ROLES.some((role) => role === value);

export interface Person {
  /** The account id (ADR-NOTE-009). */
  id: string;
  role: Role;
  name: string | null;
}

/** The people who have used Notes (ADR-NOTE-009). App access decides who gets in. */
export class People {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  get(id: string): Person | undefined {
    const row = this.#db
      .prepare("SELECT id, role, name FROM people WHERE id = ?")
      .get(id);
    if (!row) return undefined;
    const role = text(row, "role");
    if (!isRole(role)) throw new Error(`Unknown role ${role}`);
    return { id: text(row, "id"), role, name: nullableText(row, "name") };
  }

  /**
   * The person the gateway let in, added on their first request and kept in step with the
   * accounts service.
   */
  admit(identity: Identity): Person {
    const person: Person = {
      id: identity.id,
      // Admin-level App access to Notes makes someone a Notes owner (ADR-NOTE-009).
      role: identity.access.notes === "admin" ? "owner" : "member",
      name: identity.name,
    };
    this.#db
      .prepare(
        `INSERT INTO people (id, role, name, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET role = excluded.role, name = excluded.name`,
      )
      .run(person.id, person.role, person.name, Date.now());
    return person;
  }
}
