import type { DatabaseSync } from "node:sqlite";

/**
 * Stores each Yjs document as one merged binary state (ADR-NOTE-005), in the same SQLite
 * file as Better Auth's tables.
 */
export class DocumentStore {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
    db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        name       TEXT PRIMARY KEY,
        state      BLOB NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  load(name: string): Uint8Array | null {
    const row = this.db
      .prepare("SELECT state FROM documents WHERE name = ?")
      .get(name);
    if (!row) return null;
    if (!(row.state instanceof Uint8Array))
      throw new Error(`Document ${name} has no binary state`);
    return new Uint8Array(row.state);
  }

  save(name: string, state: Uint8Array): void {
    this.db
      .prepare(
        `INSERT INTO documents (name, state, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`,
      )
      .run(name, state, Date.now());
  }

  count(): number {
    const n = this.db.prepare("SELECT COUNT(*) AS n FROM documents").get()?.n;
    if (typeof n !== "number") throw new Error("COUNT(*) returned no number");
    return n;
  }
}
