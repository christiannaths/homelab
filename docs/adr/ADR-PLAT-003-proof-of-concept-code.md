# ADR-PLAT-003. How is proof-of-concept code kept apart from the apps?

- Status: Accepted
- Date: 2026-10-17
- Depends on: [ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)
- Dependency of: [ADR-PLAT-006](ADR-PLAT-006-code-quality.md)

## Context

Throwaway spikes often settle an app's decisions before it's built; they're worth keeping, buildable, as a record that can be rerun. They mustn't slow or break repo-wide builds and tests, and the real app mustn't grow out of one by accident. Formatting and linting are cheap enough to cover them, so `npm run check` vouches for every file.

## Decision

- **Layout:** `spikes/<spike>/` holds one spike, split into workspace packages (`web`, `server`, `e2e`…) like an app ([ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)). A spike for one app starts with the app's name (e.g. `notes-block-editing-collaboration-poc`).
- Each package is an npm workspace and an Nx project named `<spike>-<package>`, so it installs, builds and tests by name (`npx nx build <spike>-web`).
- **Tags:** `scope:<spike>`, `spike` and a `platform:` tag. Its own scope means the boundary check already stops apps and shared packages depending on it.
- **Repo-wide builds and tests skip spikes:** root `build`, `typecheck`, `test`, `test:e2e` and the Nx part of `check` pass `--exclude=tag:spike` to `nx run-many`.
- **Formatting and linting cover spikes** like the rest of the repo ([ADR-PLAT-006](ADR-PLAT-006-code-quality.md)), no rule relaxed.
- A spike is frozen once its decisions are recorded: kept for reference, maintained only for formatting and lint fixes. Its decisions and findings live in the app's `docs/`.

## Evidence

- Notes spike moved `apps/notes/` → `spikes/notes-block-editing-collaboration-poc/`: the Nx part of `npm run check` reports no spike projects; `npx nx run-many -t typecheck test build -p 'tag:spike'` still passes.
- PR #44 cleanup (renamed six spike files to kebab-case): typecheck and unit tests still pass for every spike project.

## Consequences

- A bare `npx nx run-many -t <target>` still includes spikes (Nx can't exclude projects by default). The `npm run` scripts are the repo-wide commands.
- Spike dependencies stay in `package-lock.json`; `npm install` installs them.
- A spike that stops building is fixed or deleted, not worked around in repo-wide scripts.

## Changelog

- 2026-10-17: Formatting and linting cover spikes, instead of spikes skipping every repo-wide run, so `npm run check` and the pre-commit hook hold every file to the same rules ([ADR-PLAT-006](ADR-PLAT-006-code-quality.md)). Spikes fixed by hand; builds and tests still skip them. Evidence: PR #44.
- 2026-10-16: Accepted. Spikes lived in `spikes/`, and every repo-wide script, `check` included, skipped them.
