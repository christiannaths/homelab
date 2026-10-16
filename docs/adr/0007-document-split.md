# 7. Data is split into workspace, page and database documents

- Status: Accepted
- Date: 2026-10-16
- Depends on: [ADR 1](0001-works-offline.md), [ADR 2](0002-yjs-stores-shared-data.md), [ADR 4](0004-homelab-instance.md)
- Dependency of: [ADR 8](0008-crdt-rules.md), [ADR 9](0009-blocknote-and-mantine.md)

## Context
All shared data is in Yjs ([ADR 2](0002-yjs-stores-shared-data.md)), and every device syncs the whole workspace ([ADR 1](0001-works-offline.md)). How that data is split into Yjs documents decides what syncs together, what can load lazily, and what can be computed on the device.

## Decision
- **Workspace doc** (`workspace:default`) holds the page tree. `pages` is a `Y.Map<pageId, Y.Map>` with `title`, `kind` (`page` or `database`), `parentId`, `order`, `createdAt` and `deletedAt`. Each page is a nested `Y.Map`, so concurrent edits to different fields of one page merge.
- **Page doc** (`page:<id>`), one per page, holds the rich text as a `Y.XmlFragment` named `content`. The editor owns that fragment ([ADR 9](0009-blocknote-and-mantine.md)).
- **Database doc** (`db:<id>`), one per database, holds `schema`, `rows` and `views`:
  - Every row's cells live in this one doc, so views (sort, filter, group) are **computed on the device** with no server queries.
  - Each row is its own `Y.Map` with one key per cell, so concurrent edits to different cells merge. A cell holds a scalar value and is last-writer-wins.
  - Shared view settings (such as sort) live in `views`. Per-viewer state (such as the quick filter, or which items are expanded) never goes into a shared doc.
- **Row body:** a database row's page body is a separate page doc (`page:<rowId>`). It syncs **only once it has content** (`_hasBody`), so a large table does not mean thousands of docs.
- **Deletion is soft** (`deletedAt`), and a deleted page's subtree is hidden with it. Database properties are also soft-deleted, so cell values are not lost.

## Evidence
- PR #2, 5,000-row database: re-reading the doc takes about 3 ms, computing a view 4–8 ms, and an offline reload about 0.5 s.
- Unit tests show concurrent cell edits merge. E2e tests show row bodies sync to other devices for offline use.

## Consequences
- A database's size is limited by keeping one doc in memory. The design target is thousands of rows ([ADR 4](0004-homelab-instance.md)). Much larger tables would need rows split across docs, in a new ADR.
- Cell text is last-writer-wins, not merged character by character. Collaborative text belongs in page bodies.
