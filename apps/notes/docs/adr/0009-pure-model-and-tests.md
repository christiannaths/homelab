# 9. The data model is pure TypeScript, tested by unit and end-to-end tests

- Status: Accepted
- Date: 2026-10-16
- Depends on: [ADR 5](../../../../docs/adr/0005-typescript-node-26-npm.md), [ADR 7](0007-crdt-rules.md)
- Dependency of: [ADR 10](0010-yjs-13-until-stack-supports-14.md)

## Context
The riskiest logic (merging, ordering, cycle repair, view computation) is easy to get subtly wrong and hard to check by clicking around. [ADR 7](0007-crdt-rules.md) requires a convergence test for every CRDT rule.

## Decision
- The data model is **plain TypeScript with no React or DOM** (`apps/notes/web/src/model/`, plus the doc helpers in `apps/notes/web/src/sync/`). UI components call it and do not re-implement it.
- **Unit tests (Vitest)** cover the model directly, including the convergence tests.
- **End-to-end tests (Playwright)** run against the production build and real server processes. Each test gets its own server and data directory, so a test can stop and restart the server and take a browser offline. Performance-sensitive paths print timings.
- What the sandbox cannot automate (Safari and WebKit, iOS install, touch gestures) goes into the PR as manual steps, and stays "not verified" until someone runs them.

## Evidence
- PR #1: the e2e tests caught a real bug, Hocuspocus disconnecting clients that sync more than 100 docs.
- PR #2: the e2e tests caught the delayed offline detection. Model bugs were fixed against unit tests before the UI existed.

## Consequences
- `npm test` and `npm run test:e2e` must pass before merging.
- A test failure is not dismissed as a "flake" without a root cause. Traces are kept on failure for diagnosis.
- Yjs use stays behind the model and sync modules, which keeps library migrations contained ([ADR 10](0010-yjs-13-until-stack-supports-14.md)).
