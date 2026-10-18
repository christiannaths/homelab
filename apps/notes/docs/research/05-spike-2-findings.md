# Spike 2 findings: page tree + database table view

**Goal:** check two more risks from `03-architecture.md`:

- **#3:** Can concurrent page-tree moves (including ones that would create a cycle) converge safely?
- **#4:** Can database views over ~5,000 rows be computed on the device, fast enough for a phone?

## What was built

- **Nested pages:**
  - add subpages and collapse/expand (expansion is per device)
  - drag and drop to reorder or re-nest (mouse; long-press on touch)
  - trash and restore, where trashing a page hides its subtree
- **Databases:** a database is a sidebar item backed by one Y.Doc:
  - property types: text, number, select (with coloured options), checkbox and date
  - a table view with shared sort and a per-viewer filter
  - virtualized rows
  - each row opens as a page with a property panel and a block-editor body
- **Model in pure TS** (`apps/web/src/model/`), with 18 Vitest unit tests including CRDT convergence tests.

## Page tree: how it stays consistent

- Each page stores `parentId` plus a **fractional-index `order` key** (`fractional-indexing`). A move writes only the moved page's two fields.
- Ties between identical keys, from two devices inserting into the same gap, are broken by id. The next move into that gap renumbers the siblings.
- Concurrent moves can still make a **cycle**: A→under B on one device and B→under A on another, both offline. Instead of writing a repair, every client derives the same effective tree with `resolveParents`:
  - a cycle is broken at its smallest page id, which becomes top level
  - a parent that is missing or is a database counts as the root
  - because it's computed rather than written, nothing can conflict or loop
- The UI blocks moves that would create a cycle locally: a page can't be dropped into its own subtree.

## Database: data model

- One Y.Doc per database (`db:<id>`) holds the `schema`, all `rows` (one Y.Map per row, one key per cell), and `views` (shared sort). Views are computed locally, with no server queries.
- Each cell is last-writer-wins. Different cells in the same row merge (unit-tested).
- Row bodies are separate docs (`page:<rowId>`), **synced only once they have content** (`_hasBody`), so a 5,000-row table doesn't mean 5,000 docs to sync and hold in memory.
- **Only the device that creates a database initializes its schema.** A device that hasn't synced it yet sees an empty doc. If it wrote its own title column there, that Y.Map would compete with the real one (map keys are last-writer-wins) and could revert a rename. Such a device shows "Waiting for this database to sync…" instead.

## Results (headless Chromium, Node 26, localhost)

| 5,000 rows, 6 properties                        | Time       |
| ----------------------------------------------- | ---------- |
| Create all rows in one transaction, then render | ~1.6 s     |
| Re-read the whole database doc after any change | ~3 ms      |
| Compute view (sort or filter)                   | 4–8 ms     |
| Click sort → re-rendered                        | ~110 ms    |
| Type a filter → re-rendered                     | ~65–100 ms |
| Offline reload → all 5,000 rows listed          | ~0.5 s     |

Rows are virtualized, so fewer than 80 row elements are in the DOM at any time.

## Problems found (and fixed)

1. **Playwright's offline mode (and real devices) don't close an open WebSocket.** The app kept showing "Synced" for up to ~30 s after losing the network, until the provider's message timeout fired. **Fixed:** `SyncManager` now disconnects on the browser's `offline` event and reconnects on `online`.
2. **Database initialization on an unsynced device** could clobber the real schema (see above). Caught in design, before it shipped.
3. **One unreproduced test failure:** the drag-and-drop e2e test failed once in about 50 runs (full suite, right after a build) and passed every rerun, including 15 runs under full CPU load. Playwright now keeps a trace on failure, so the next occurrence can be diagnosed. Not hidden or retried away.

## Not verified yet (needs real devices)

- **Touch drag and drop on iOS** (long-press ~250 ms on a sidebar item). Playwright can't synthesize touch drags.
- 5,000-row performance on an iPhone: sorting, filtering and scrolling.
- Native date and select pickers inside the table on iOS.

## Known limitations / next

- Phone layout: the sidebar sits above the content and takes up to 40% of the screen. It needs a slide-over drawer.
- No board view, no filters beyond the quick text filter, and no relations yet.
- Property type can't be changed after creation.
- Startup storage bottleneck (one IndexedDB database per doc) and per-document auth limits from spike 1 are still open.
