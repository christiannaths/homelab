import type { DatabaseSync } from "node:sqlite";
import type { Identity } from "@homelab/identity";

export interface Person {
  /** The account id (ADR-NOTE-009). */
  id: string;
  name: string | null;
}

/** The people who have used Notes (ADR-NOTE-009). App access decides who gets in. */
export class People {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  /**
   * The person the gateway let in, added on their first request and kept in step with the
   * accounts service.
   */
  admit(identity: Identity): Person {
    const person: Person = { id: identity.id, name: identity.name };
    this.#db
      .prepare(
        `INSERT INTO people (id, name, created_at) VALUES (?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET name = excluded.name`,
      )
      .run(person.id, person.name, Date.now());
    return person;
  }
}
