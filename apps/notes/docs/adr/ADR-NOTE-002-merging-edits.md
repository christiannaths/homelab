# ADR-NOTE-002. How do edits from several devices come together?

- Status: Accepted
- Date: 2026-10-16
- Depends on: [ADR-NOTE-001](ADR-NOTE-001-offline-use.md)
- Dependency of: [ADR-NOTE-006](ADR-NOTE-006-merge-safety.md), [ADR-NOTE-007](ADR-NOTE-007-page-editing-and-ui.md), [ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md), [ADR-NOTE-013](ADR-NOTE-013-data-layout.md)

## Context

Offline edits from several devices ([ADR-NOTE-001](ADR-NOTE-001-offline-use.md)) must merge automatically and identically everywhere, with no "pick a version" prompts. That requires a CRDT.

## Decision

- **All synced data is stored in Yjs documents:** page content, the page tree, and database schemas, rows, cells and views.
- No second source of truth sits beside Yjs, such as relational tables that clients sync.
- The server stores and relays Yjs updates and never needs a different data format.
- The project is on Yjs 13, and issue [#4](https://github.com/christiannaths/homelab/issues/4) tracks the move to 14. Moving to Yjs 14 is a planned migration, not a change of direction.

## Alternatives considered

- **Automerge** or **Loro**, compared with Yjs in [`research/01-foss-landscape.md`](../research/01-foss-landscape.md) and [`research/03-architecture.md`](../research/03-architecture.md). Neither has editor bindings as mature as Yjs's.

## Evidence

- Yjs has the most mature editor bindings (ProseMirror, Tiptap, BlockNote), with live cursors and presence built in.
- Yjs is independent of storage and transport, so either can be replaced without changing the data model.
- Yjs data is readable outside JavaScript through `yrs` (Rust, with Python and Swift bindings), so the data is not locked to one runtime.
- PR #1: live co-editing, offline merging and server persistence work end to end with Yjs, BlockNote and Hocuspocus.
- PR #2: Vitest convergence tests edit two `Y.Doc`s independently, then merge them. They cover page moves, cycles, concurrent inserts, and concurrent edits to cells in the same row.

## Consequences

- Every feature's data is designed as Yjs shared types, with its merge behaviour decided up front ([ADR-NOTE-006](ADR-NOTE-006-merge-safety.md)).
- Yjs data is not queryable on the server. Server-side search or indexing has to decode documents.
- Yjs history grows over time, so compaction and snapshots will eventually be needed.
