import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import {
  isRole,
  type Person,
  type Role,
} from "@homelab/notes-access-sync-poc-model";

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
      .get(name);
    if (!row) return null;
    const { state } = row;
    if (!(state instanceof Uint8Array))
      throw new Error(`document ${name} has no binary state`);
    return new Uint8Array(state);
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
    return this.db
      .prepare("SELECT name FROM documents WHERE substr(name, 1, ?) = ?")
      .all(prefix.length, prefix)
      .map((r) => stringColumn(r, "name"));
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM documents").get();
    const n = row?.n;
    if (typeof n !== "number") throw new Error("COUNT(*) returned no number");
    return n;
  }

  /** Everyone in the workspace, in the order they were added. */
  people(): Person[] {
    return this.db
      .prepare("SELECT id, name, role FROM people ORDER BY created_at, rowid")
      .all()
      .map((r) => ({
        id: stringColumn(r, "id"),
        name: stringColumn(r, "name"),
        role: roleColumn(r),
      }));
  }

  addPerson(person: Person): void {
    this.db
      .prepare(
        "INSERT INTO people (id, name, role, created_at) VALUES (?, ?, ?, ?)",
      )
      .run(person.id, person.name, person.role, Date.now());
  }

  removePerson(id: string): void {
    this.db.prepare("DELETE FROM people WHERE id = ?").run(id);
  }

  close(): void {
    this.db.close();
  }
}

type Row = Record<string, SQLOutputValue>;

function stringColumn(row: Row, column: string): string {
  const value = row[column];
  if (typeof value !== "string")
    throw new Error(`column ${column} is not text`);
  return value;
}

function roleColumn(row: Row): Role {
  const role = row.role;
  if (!isRole(role)) throw new Error(`unknown role ${String(role)}`);
  return role;
}
