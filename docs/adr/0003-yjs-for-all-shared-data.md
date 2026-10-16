# 3. Yjs is the CRDT for all shared data

- Status: Accepted
- Date: 2026-10-16

## Context
Offline edits from several devices must merge automatically and the same way everywhere, with no "pick a version" prompts. That requires a CRDT. We compared Yjs, Automerge and Loro (`research/01-foss-landscape.md`, `research/03-architecture.md`).

## Decision
- **All synced data is stored in Yjs documents:** page content, the page tree, database schemas, rows, cells and views.
- No second source of truth sits beside Yjs, such as relational tables that clients sync.
- The server stores and relays Yjs updates, and never needs a different data format.
- We're on **Yjs 13** (ADR 12). The move to Yjs 14 is a planned migration, not a change of direction.

## Why Yjs
- It has the most mature editor bindings (ProseMirror/Tiptap/BlockNote), and live cursors and presence are built in.
- It doesn't care how documents are stored or transported, so storage and sync can be replaced without changing the data model.
- It's readable outside JS through `yrs` (Rust, with Python and Swift bindings), so the data isn't locked to one runtime.

## Evidence
- PR #1: live co-editing, offline merge and server persistence work end to end with Yjs, BlockNote and Hocuspocus.
- PR #2: Vitest convergence tests with two Y.Docs edited independently and then merged. They cover page moves, cycles, concurrent inserts, and concurrent edits to cells in the same row.

## Consequences
- Every feature's data must be designed as Yjs shared types, with its merge behaviour decided up front (ADR 9).
- Plain Yjs data isn't queryable on the server. Server-side search or indexing would have to decode documents.
- Yjs history grows over time. Compaction and snapshots will be needed eventually.
