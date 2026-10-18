import type { DatabaseSync } from "node:sqlite";
import { blob, integer } from "./rows.ts";

/** Stores each Yjs document as one merged binary state (ADR-NOTE-005). */
export class DocumentStore {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  load(name: string): Uint8Array | null {
    const row = this.#db
      .prepare("SELECT state FROM documents WHERE name = ?")
      .get(name);
    return row ? new Uint8Array(blob(row, "state")) : null;
  }

  save(name: string, state: Uint8Array): void {
    this.#db
      .prepare(
        `INSERT INTO documents (name, state, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (name) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`,
      )
      .run(name, state, Date.now());
  }

  count(): number {
    const row = this.#db.prepare("SELECT COUNT(*) AS n FROM documents").get();
    if (!row) throw new Error("COUNT(*) returned no row");
    return integer(row, "n");
  }
}
