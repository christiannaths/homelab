# ADR-NOTE-008. How is the data model kept correct?

- Status: Accepted
- Date: 2026-10-16
- Depends on: [ADR-NOTE-006](ADR-NOTE-006-merge-safety.md), [ADR-PLAT-001](../../../../docs/adr/ADR-PLAT-001-toolchain.md)
- Dependency of: none

## Context

Merging, ordering, cycle repair and view computation are easy to get subtly wrong and hard to check by clicking. [ADR-NOTE-006](ADR-NOTE-006-merge-safety.md) needs a convergence test per CRDT rule.

## Decision

- The model is **plain TypeScript, no React or DOM**, beside the Yjs helpers. UI calls it, never re-implements it.
- **Vitest** unit-tests the model, convergence tests included.
- **Playwright** e2e runs the production build against real servers, each with its own server and data directory, so tests can restart the server and go offline. Performance-sensitive paths print timings.
- What the sandbox can't automate (Safari/WebKit, iOS install, touch) goes in the PR as manual steps, "not verified" until run.

## Evidence

- PR #1 → e2e caught Hocuspocus disconnecting clients syncing >100 docs.
- PR #2 → e2e caught delayed offline detection; model bugs fixed against unit tests before the UI existed.

## Consequences

- `npm test` and `npm run test:e2e` must pass before merging.
- No failure is a "flake" without a root cause; traces kept on failure.
- Yjs stays behind the model and sync modules, containing migrations.
