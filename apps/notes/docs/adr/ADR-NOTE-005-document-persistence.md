# ADR-NOTE-005. How does the server keep documents safe across restarts?

- Status: Accepted
- Date: 2026-10-16
- Depends on: [ADR-NOTE-004](ADR-NOTE-004-hosting-and-scale.md), [ADR-PLAT-001](../../../../docs/adr/ADR-PLAT-001-toolchain.md)
- Dependency of: [ADR-NOTE-009](ADR-NOTE-009-identity.md), [ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md), [ADR-NOTE-014](ADR-NOTE-014-http-and-accounts.md)

## Context
The server only needs to keep each document's latest Yjs state and return it. At homelab scale ([ADR-NOTE-004](ADR-NOTE-004-hosting-and-scale.md)), easy backup and zero operations matter more than horizontal scaling.

## Decision
- Server data lives in **one SQLite database file** in `DATA_DIR`, accessed through Node's built-in `node:sqlite` ([ADR-PLAT-001](../../../../docs/adr/ADR-PLAT-001-toolchain.md)) in WAL mode.
- Each document is stored as its merged Yjs state (`documents(name, state BLOB, updated_at)`).
- The server treats document contents as opaque. Server-side features that need the contents (such as search or history) are built alongside, without changing this storage format.

## Alternatives considered
- **Postgres**, a separate service to run and back up, where [ADR-NOTE-004](ADR-NOTE-004-hosting-and-scale.md) keeps everything in one container.

## Evidence
- PR #1: data survives server restarts, and a new device rebuilds everything from SQLite.
- There are no native dependencies, so the Docker build stays simple.

## Consequences
- Backup means copying one file, or running `sqlite3 .backup`.
- Only one server process runs at a time, which suits the intended scale.
