# 8. CRDT rules every feature must follow

- Status: Accepted
- Date: 2026-10-16

## Context
The spikes found two ways a design that looks right becomes wrong once several devices edit offline:
- concurrent page moves can form a cycle
- a device that hasn't synced yet can create a shared structure that then competes with the real one (`Y.Map` keys are last-writer-wins, so a fresh map can overwrite a renamed one)

## Decision
All features follow these rules:

1. **Derive, don't repair.** If merged data can be invalid (cycles, dangling references, duplicate positions), every client computes the same valid view from it deterministically, instead of writing a fix. Two clients writing fixes would conflict or loop.
   - The page tree breaks a cycle at the page with the smallest id, which becomes top level.
   - A missing or non-page parent counts as the root.
2. **Create shared structures exactly once, on the device that creates the entity.** Never lazily create a `Y.Map`/`Y.Array` under a well-known key when something is read. A device that finds a structure missing waits for sync (e.g. "Waiting for this database to sync…").
3. **Sibling order uses fractional-index keys** (`fractional-indexing`). Ties are broken by id. When siblings' keys are tied or missing, they're renumbered before inserting between them. A move or insert writes only the item being moved or inserted.
4. **Make the smallest independent change.** Nest a `Y.Map` per entity (page, row) and use one key per field, so concurrent edits to different fields merge instead of replacing each other.
5. **Every rule is covered by a convergence test.** Two `Y.Doc`s are edited independently, then synced both ways, and both must give the same valid result.

## Evidence
- PR #2: unit tests for cycles in any input order, concurrent A-into-B and B-into-A moves, concurrent inserts at the same position, and concurrent cell edits. An e2e test makes conflicting offline moves in two browsers and checks they converge.
- The schema-initialization hazard was found in design review during PR #2 and fixed under rule 2.

## Consequences
- New features need a short "how does this merge?" note and a convergence test before they're considered done.
- A derived view can differ from the stored data (e.g. a page whose `parentId` points into a cycle). Code must read the derived view (`buildTree`), not raw fields.
