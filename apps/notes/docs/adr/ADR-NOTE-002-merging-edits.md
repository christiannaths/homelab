# ADR-NOTE-002. How do edits from several devices come together?

- Status: Accepted
- Date: 2026-10-16
- Depends on: [ADR-NOTE-001](ADR-NOTE-001-offline-use.md)
- Dependency of: [ADR-NOTE-006](ADR-NOTE-006-merge-safety.md), [ADR-NOTE-007](ADR-NOTE-007-page-editing-and-ui.md), [ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md), [ADR-NOTE-013](ADR-NOTE-013-data-layout.md)

## Context

Offline edits from several devices ([ADR-NOTE-001](ADR-NOTE-001-offline-use.md)) must merge automatically and identically, with no "pick a version" prompt. That needs a CRDT.

## Decision

- **All synced data is Yjs:** page content, page tree, database schemas, rows, cells, views.
- No second source of truth (e.g. synced relational tables). The server stores and relays Yjs updates only.
- On Yjs 13; moving to 14 ([#4](https://github.com/christiannaths/homelab/issues/4)) is a planned migration.

## Alternatives considered

- **Automerge, Loro** ([`research/01-foss-landscape.md`](../research/01-foss-landscape.md), [`research/03-architecture.md`](../research/03-architecture.md)): less mature editor bindings.

## Evidence

- Most mature editor bindings (ProseMirror, Tiptap, BlockNote), cursors and presence built in.
- Storage- and transport-independent; readable outside JS via `yrs` (Rust, Python, Swift).
- PR #1 → co-editing, offline merge and persistence work with Yjs, BlockNote, Hocuspocus.
- PR #2 → two-`Y.Doc` convergence tests: moves, cycles, concurrent inserts, same-row cell edits.

## Consequences

- Every feature's data is Yjs shared types with merge behaviour decided up front ([ADR-NOTE-006](ADR-NOTE-006-merge-safety.md)).
- Not queryable on the server: search or indexing must decode documents.
- History grows; compaction and snapshots will be needed.
