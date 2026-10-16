import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Person, Role } from "@homelab/notes-access-sync-poc-model";

/**
 * SQLite storage. Each Yjs document is one merged binary state: the server doesn't need to
 * understand the contents, they are opaque CRDT blobs. People live in their own table for now;
 * where access data finally lives is for the spike to decide.
 */
export class Store {
  private db: DatabaseSync;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.db = new DatabaseSync(path.join(dataDir, "notes-access.sqlite"));
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS documents (
        name       TEXT PRIMARY KEY,
        state      BLOB NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS people (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        role       TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }

  load(name: string): Uint8Array | null {
    const row = this.db
      .prepare("SELECT state FROM documents WHERE name = ?")
      .get(name) as { state: Uint8Array } | undefined;
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

  /** Names of the stored documents that start with `prefix`. */
  names(prefix: string): string[] {
    return (
      this.db.prepare("SELECT name FROM documents WHERE substr(name, 1, ?) = ?").all(prefix.length, prefix) as {
        name: string;
      }[]
    ).map((r) => r.name);
  }

  count(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM documents").get() as { n: number }).n;
  }

  /** Everyone in the workspace, in the order they were added. */
  people(): Person[] {
    return (
      this.db.prepare("SELECT id, name, role FROM people ORDER BY created_at, rowid").all() as {
        id: string;
        name: string;
        role: string;
      }[]
    ).map((r) => ({ id: r.id, name: r.name, role: r.role as Role }));
  }

  addPerson(person: Person): void {
    this.db
      .prepare("INSERT INTO people (id, name, role, created_at) VALUES (?, ?, ?, ?)")
      .run(person.id, person.name, person.role, Date.now());
  }

  close(): void {
    this.db.close();
  }
}
