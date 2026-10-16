# 6. The server stores Yjs document state in SQLite

- Status: Accepted
- Date: 2026-10-16

## Context
The server only needs to keep each document's latest Yjs state and give it back. At homelab scale (ADR 4), easy backup and zero operations matter more than horizontal scaling.

## Decision
- Server data lives in **one SQLite database file** in `DATA_DIR`, accessed through Node's built-in `node:sqlite` in WAL mode.
- Each document is stored as its merged Yjs state (`documents(name, state BLOB, updated_at)`).
- The server treats document contents as opaque. Any server-side features that need the contents (search, history, publishing in ADR 14) are built alongside, without changing this storage format.
- Postgres isn't supported. Adding it would need a new ADR.

## Evidence
- PR #1: data survives server restarts. A new device rebuilds everything from SQLite. There are no native dependencies, so the Docker build stays simple.

## Consequences
- Backup means copying one file (or using `sqlite3 .backup`).
- One server process at a time. That's fine for the intended scale.
