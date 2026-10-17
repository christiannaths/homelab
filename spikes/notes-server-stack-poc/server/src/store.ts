import type { DatabaseSync } from "node:sqlite";

/**
 * Stores each Yjs document as one merged binary state (ADR 6), in the same SQLite
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
    const row = this.db.prepare("SELECT state FROM documents WHERE name = ?").get(name) as
      | { state: Uint8Array }
      | undefined;
    return row ? new Uint8Array(row.state) : null;
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
    return (this.db.prepare("SELECT COUNT(*) AS n FROM documents").get() as { n: number }).n;
  }
}
