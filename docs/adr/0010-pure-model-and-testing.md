# 10. A pure data-model layer, tested at two levels

- Status: Accepted
- Date: 2026-10-16

## Context
The riskiest logic (merging, ordering, cycle repair, view computation) is easy to get subtly wrong and hard to check by clicking around.

## Decision
- The data model lives in **plain TypeScript with no React or DOM** (`apps/web/src/model/`, plus the doc helpers in `apps/web/src/sync/`). UI components call it and don't re-implement it.
- **Unit tests (Vitest)** cover the model directly, including the convergence tests required by ADR 8.
- **End-to-end tests (Playwright)** run against the production build and real server processes. Each test gets its own server and data directory, so tests can stop and restart the server and switch browsers offline. Performance-sensitive paths print timings.
- Things the sandbox can't automate (Safari/WebKit, iOS install, touch gestures) go in the PR as manual steps, and stay "not verified" until someone runs them.

## Evidence
- PR #1: the e2e tests caught a real bug, Hocuspocus disconnecting clients syncing more than 100 docs.
- PR #2: the e2e tests caught the delayed offline detection. Model bugs were fixed against unit tests before the UI existed.

## Consequences
- `npm test` and `npm run test:e2e` must pass before merging.
- A test failure isn't dismissed as a "flake" without a root cause. Traces are kept on failure for diagnosis.
