# 8. How data is split across Yjs documents

- Status: Accepted
- Date: 2026-10-16

## Context
How data is split across Yjs documents decides what syncs together, what can be loaded lazily, and what can be computed on the device.

## Decision
- **Workspace doc** (`workspace:default`): the page tree. `pages` is a `Y.Map<pageId, Y.Map>` holding `title`, `kind` (`page` | `database`), `parentId`, `order`, `createdAt` and `deletedAt`. Each page is a nested `Y.Map`, so concurrent edits to different fields of the same page merge.
- **Page doc** (`page:<id>`): one per page. Its rich text is a `Y.XmlFragment` named `content`, owned by the editor (ADR 10).
- **Database doc** (`db:<id>`): one per database. It holds `schema`, `rows` and `views`.
  - Every row's cells live in this one doc, so views (sort, filter, group) are **computed on the device** with no server queries.
  - Each row is its own `Y.Map`, with one key per cell, so concurrent edits to different cells merge. A cell holds a scalar and is last-writer-wins.
  - Shared view settings (e.g. sort) live in `views`. Per-viewer state (e.g. the quick filter, which items are expanded) never goes into a shared doc.
- **Database row body**: a row's page body is a separate page doc (`page:<rowId>`). It's **synced only once it has content** (`_hasBody`), so large tables don't mean thousands of docs.
- Deleting a page is **soft** (`deletedAt`), and its subtree is hidden with it. Database properties are also soft-deleted, so cell values aren't lost.

## Evidence
- PR #2 measurements for a 5,000-row database: re-reading the doc ~3 ms, computing a view 4–8 ms, an offline reload ~0.5 s.
- Unit tests show concurrent cell edits merge, and e2e tests show row bodies sync to other devices for offline use.

## Consequences
- A database's size is limited by keeping one doc in memory. Thousands of rows is the design target (ADR 5). Much larger tables would need splitting rows across docs, which would be a new ADR.
- Cell text is last-writer-wins, not character-merged. Collaborative text belongs in page bodies.
