# ADR-NOTE-006. How do features avoid conflicts and lost edits when changes merge?

- Status: Accepted
- Date: 2026-10-16
- Depends on: [ADR-NOTE-002](ADR-NOTE-002-merging-edits.md)
- Dependency of: [ADR-NOTE-008](ADR-NOTE-008-model-correctness.md), [ADR-NOTE-013](ADR-NOTE-013-data-layout.md)

## Context

The spikes found two ways in which a design that looks right becomes wrong once several devices edit offline. Concurrent page moves can form a cycle in the page tree. A device that has not synced yet can create a shared structure that then competes with the real one: `Y.Map` keys are last-writer-wins, so a fresh map can overwrite a renamed one.

## Decision

1. **Derive, do not repair.** When merged data can be invalid (cycles, dangling references, duplicate positions), every client computes the same valid view from it deterministically, instead of writing a fix. Two clients writing fixes would conflict or loop.
   - The page tree breaks a cycle at the page with the smallest id, which becomes top level.
   - A missing parent, or a parent that is not a page, counts as the root.
2. **Create shared structures exactly once, on the device that creates the entity.** No code lazily creates a `Y.Map` or `Y.Array` under a well-known key when reading. A device that finds a structure missing waits for sync (for example, "Waiting for this database to sync…").
3. **Sibling order uses fractional-index keys** (`fractional-indexing`), with ties broken by id. When siblings' keys are tied or missing, they are renumbered before inserting between them. A move or insert writes only the item that moves or is inserted.
4. **Each change is the smallest independent change.** Each entity (page, row) is a nested `Y.Map` with one key per field, so concurrent edits to different fields merge instead of replacing each other.
5. **Every rule is covered by a convergence test.** Two `Y.Doc`s are edited independently and then synced both ways, and both must produce the same valid result.

## Evidence

- PR #2 unit tests: cycles in any input order, concurrent A-into-B and B-into-A moves, concurrent inserts at the same position, and concurrent cell edits.
- PR #2 e2e test: conflicting offline moves in two browsers converge.
- The schema-initialization hazard was found in design review during PR #2 and fixed under rule 2.

## Consequences

- A new feature is done only once it has a short "how does this merge?" note and a convergence test ([ADR-NOTE-008](ADR-NOTE-008-model-correctness.md)).
- A derived view can differ from the stored data (for example, a page whose `parentId` points into a cycle). Code reads the derived view (`buildTree`), not raw fields.
