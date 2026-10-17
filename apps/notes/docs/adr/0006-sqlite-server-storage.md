# 6. The server stores document state in SQLite

- Status: Accepted
- Date: 2026-10-16
- Depends on: [ADR 4](0004-homelab-instance.md), [ADR 5](../../../../docs/adr/0005-typescript-node-26-npm.md)
- Dependency of: [ADR 11](0011-local-password-accounts.md), [ADR 12](0012-hocuspocus-sync-server.md), [ADR 19](0019-hocuspocus-checks-every-document-and-update.md), [ADR 20](0020-hono-http-and-better-auth-accounts.md)

## Context
The server only needs to keep each document's latest Yjs state and return it. At homelab scale ([ADR 4](0004-homelab-instance.md)), easy backup and zero operations matter more than horizontal scaling.

## Decision
- Server data lives in **one SQLite database file** in `DATA_DIR`, accessed through Node's built-in `node:sqlite` ([ADR 5](../../../../docs/adr/0005-typescript-node-26-npm.md)) in WAL mode.
- Each document is stored as its merged Yjs state (`documents(name, state BLOB, updated_at)`).
- The server treats document contents as opaque. Server-side features that need the contents (such as search or history) are built alongside, without changing this storage format.
- Postgres is not supported. Adding it would need a new ADR.

## Evidence
- PR #1: data survives server restarts, and a new device rebuilds everything from SQLite.
- There are no native dependencies, so the Docker build stays simple.

## Consequences
- Backup means copying one file, or running `sqlite3 .backup`.
- Only one server process runs at a time, which suits the intended scale.
