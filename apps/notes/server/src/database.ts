import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { integer } from "./rows.ts";

/**
 * Each entry upgrades the schema by one version, tracked in SQLite's `user_version`.
 * Entries are only ever appended: an existing data directory runs the ones it has not seen yet.
 */
const MIGRATIONS = [
  `
  -- ADR-NOTE-005: each Yjs document as one merged binary state.
  CREATE TABLE documents (
    name       TEXT PRIMARY KEY,
    state      BLOB NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- ADR-NOTE-009: the people Notes admits, keyed by VoidAuth's sub.
  CREATE TABLE people (
    id         TEXT PRIMARY KEY,
    role       TEXT NOT NULL CHECK (role IN ('owner', 'member', 'guest')),
    name       TEXT,
    created_at INTEGER NOT NULL
  );

  -- ADR-NOTE-014: one row per signed-in device. Only a hash of the cookie's token is stored.
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    person_id  TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    renewed_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX sessions_by_person ON sessions (person_id);
  `,
  `
  -- ADR-NOTE-014: the gateway signs people in, so Notes keeps no device sessions. ADR-NOTE-009:
  -- people are keyed by VoidAuth username instead of sub, so the people keyed by sub are dropped.
  DROP TABLE sessions;
  DELETE FROM people;
  `,
];

/** Opens (or creates) the instance's one SQLite file in `dataDir`, at the latest schema. */
export function openDatabase(dataDir: string): DatabaseSync {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, "notes.sqlite"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  const versionRow = db.prepare("PRAGMA user_version").get();
  if (!versionRow) throw new Error("PRAGMA user_version returned no row");
  const version = integer(versionRow, "user_version");
  for (const [index, sql] of MIGRATIONS.entries()) {
    if (index < version) continue;
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${index + 1}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  return db;
}
