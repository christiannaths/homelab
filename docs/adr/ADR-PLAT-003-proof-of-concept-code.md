# ADR-PLAT-003. How is proof-of-concept code kept apart from the apps?

- Status: Accepted
- Date: 2026-10-17
- Depends on: [ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)
- Dependency of: [ADR-PLAT-006](ADR-PLAT-006-code-quality.md)

## Context

Spikes settle decisions before an app is built and are worth keeping runnable as a record. They mustn't slow or break repo-wide builds, or grow into the real app.

## Decision

- **Layout:** `spikes/<spike>/`, split into workspace packages like an app ([ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)); named with the app first (e.g. `notes-block-editing-collaboration-poc`). Nx projects are `<spike>-<package>` (`npx nx build <spike>-web`).
- **Tags:** `scope:<spike>`, `spike`, a `platform:` tag. Own scope means apps and packages can't depend on it.
- **Builds and tests skip spikes:** root `build`, `typecheck`, `test`, `test:e2e` and the Nx part of `check` pass `--exclude=tag:spike`.
- **Formatting and linting cover spikes**, no rule relaxed ([ADR-PLAT-006](ADR-PLAT-006-code-quality.md)).
- **Frozen** once its decisions are recorded; only format and lint fixes. Findings live in the app's `docs/`.

## Evidence

- `npx nx run-many -t typecheck test build -p 'tag:spike'` passes; `npm run check` lists no spike projects.

## Consequences

- Bare `npx nx run-many` still includes spikes (Nx can't exclude by default); use the `npm run` scripts.
- A spike that stops building is fixed or deleted, not worked around.

## Changelog

- 2026-10-17: Formatting and linting cover spikes, so `npm run check` and the hook hold every file to one standard ([ADR-PLAT-006](ADR-PLAT-006-code-quality.md), PR #44).
- 2026-10-16: Accepted. Every repo-wide script, `check` included, skipped spikes.
