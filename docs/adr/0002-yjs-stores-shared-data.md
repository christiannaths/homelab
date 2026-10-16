# 2. Yjs stores all shared data

- Status: Accepted
- Date: 2026-10-16
- Depends on: [ADR 1](0001-works-offline.md)
- Dependency of: [ADR 7](0007-document-split.md), [ADR 8](0008-crdt-rules.md), [ADR 9](0009-blocknote-and-mantine.md), [ADR 11](0011-yjs-13-until-stack-supports-14.md), [ADR 13](0013-hocuspocus-sync-server.md)

## Context
Offline edits from several devices ([ADR 1](0001-works-offline.md)) must merge automatically and identically everywhere, with no "pick a version" prompts. That requires a CRDT. Yjs, Automerge and Loro were compared in `research/01-foss-landscape.md` and `research/03-architecture.md`.

## Decision
- **All synced data is stored in Yjs documents:** page content, the page tree, and database schemas, rows, cells and views.
- No second source of truth sits beside Yjs, such as relational tables that clients sync.
- The server stores and relays Yjs updates and never needs a different data format.
- The project is on Yjs 13 ([ADR 11](0011-yjs-13-until-stack-supports-14.md)). Moving to Yjs 14 is a planned migration, not a change of direction.

## Evidence
- Yjs has the most mature editor bindings (ProseMirror, Tiptap, BlockNote), with live cursors and presence built in.
- Yjs is independent of storage and transport, so either can be replaced without changing the data model.
- Yjs data is readable outside JavaScript through `yrs` (Rust, with Python and Swift bindings), so the data is not locked to one runtime.
- PR #1: live co-editing, offline merging and server persistence work end to end with Yjs, BlockNote and Hocuspocus.
- PR #2: Vitest convergence tests edit two `Y.Doc`s independently, then merge them. They cover page moves, cycles, concurrent inserts, and concurrent edits to cells in the same row.

## Consequences
- Every feature's data is designed as Yjs shared types, with its merge behaviour decided up front ([ADR 8](0008-crdt-rules.md)).
- Yjs data is not queryable on the server. Server-side search or indexing has to decode documents.
- Yjs history grows over time, so compaction and snapshots will eventually be needed.
