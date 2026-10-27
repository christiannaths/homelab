# ADR-NOTE-006. How do features avoid conflicts and lost edits when changes merge?

- Status: Accepted
- Date: 2026-10-16
- Depends on: [ADR-NOTE-002](ADR-NOTE-002-merging-edits.md)
- Dependency of: [ADR-NOTE-008](ADR-NOTE-008-model-correctness.md), [ADR-NOTE-013](ADR-NOTE-013-data-layout.md)

## Context

The spikes found two ways correct-looking designs break under offline edits: concurrent moves form page-tree cycles, and an unsynced device creates a shared structure that competes with the real one (`Y.Map` keys are last-writer-wins, so a fresh map can overwrite a renamed one).

## Decision

1. **Derive, don't repair.** When merged data can be invalid (cycles, dangling refs, duplicate positions), every client computes the same valid view; two clients writing fixes would conflict or loop.
   - A cycle breaks at the page with the smallest id, which becomes top level.
   - A missing or non-page parent counts as the root.
2. **Create shared structures once, on the device creating the entity.** Never lazily create a `Y.Map`/`Y.Array` under a well-known key on read; if missing, wait for sync ("Waiting for this database to sync…").
3. **Sibling order: fractional-index keys** (`fractional-indexing`), ties broken by id. Tied or missing keys are renumbered before inserting between them. A move or insert writes only the moved item.
4. **Smallest independent change.** Each entity (page, row) is a nested `Y.Map`, one key per field, so edits to different fields merge.
5. **Every rule has a convergence test:** two `Y.Doc`s edited independently, synced both ways, same valid result.

## Evidence

- PR #2 unit tests → cycles in any order, A-into-B vs B-into-A, same-position inserts, cell edits.
- PR #2 e2e → conflicting offline moves in two browsers converge.
- PR #2 design review → schema-initialization hazard, fixed by rule 2.

## Consequences

- A feature is done only with a "how does this merge?" note and a convergence test ([ADR-NOTE-008](ADR-NOTE-008-model-correctness.md)).
- Code reads the derived view (`buildTree`), not raw fields, which may differ (e.g. a `parentId` into a cycle).
