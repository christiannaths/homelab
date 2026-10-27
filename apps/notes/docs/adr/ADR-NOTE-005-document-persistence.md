# ADR-NOTE-005. How does the server keep documents safe across restarts?

- Status: Accepted
- Date: 2026-10-16
- Depends on: [ADR-NOTE-004](ADR-NOTE-004-hosting-and-scale.md), [ADR-PLAT-001](../../../../docs/adr/ADR-PLAT-001-toolchain.md)
- Dependency of: [ADR-NOTE-009](ADR-NOTE-009-identity.md), [ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md), [ADR-NOTE-014](ADR-NOTE-014-http-and-accounts.md)

## Context

The server only keeps and returns each document's latest Yjs state. At homelab scale ([ADR-NOTE-004](ADR-NOTE-004-hosting-and-scale.md)), easy backup and zero ops beat horizontal scaling.

## Decision

- **One SQLite file** in `DATA_DIR`, via `node:sqlite` ([ADR-PLAT-001](../../../../docs/adr/ADR-PLAT-001-toolchain.md)), WAL mode.
- Each document stored as merged Yjs state: `documents(name, state BLOB, updated_at)`.
- Contents are opaque; features needing them (search, history) are built alongside without changing this format.

## Alternatives considered

- **Postgres:** another service to run and back up, outside the one container.

## Evidence

- PR #1 → data survives restarts; a new device rebuilds from SQLite.
- No native dependencies; simple Docker build.

## Consequences

- Backup = copy one file, or `sqlite3 .backup`.
- One server process at a time.
