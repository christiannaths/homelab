# 15. How is proof-of-concept code kept apart from the apps?

- Status: Accepted
- Date: 2026-10-16
- Depends on: [ADR 14](0014-repo-structure.md)
- Dependency of: none

## Context
An app's decisions are often settled by throwaway spikes before the app itself is built. A spike is worth keeping as a record of how a decision was tested, and worth keeping buildable so that it can be rerun. It must not slow down or break the repo-wide build and tests, and the real app must not grow out of it by accident.

## Decision
- **Layout:** `spikes/<spike>/` holds one spike, split into npm workspace packages such as `web`, `server` and `e2e`, like an app in `apps/` ([ADR 14](0014-repo-structure.md)). A spike for one app is named after it, starting with the app's name (for example `notes-block-editing-collaboration-poc`).
- Each package is still an npm workspace and an Nx project, named `<spike>-<package>`, so it installs, builds and tests by name (`npx nx build <spike>-web`).
- **Tags:** every spike project has `scope:<spike>`, the tag `spike`, and a `platform:` tag. Its own scope means the boundary check already stops apps and shared packages from depending on it.
- **Repo-wide runs skip spikes.** The root `build`, `typecheck`, `test`, `test:e2e` and `check` scripts pass `--exclude=tag:spike` to `nx run-many`.
- A spike is frozen once its decisions are recorded: it is kept for reference and not maintained. Its decisions and findings live in the app's `docs/`, not in the spike.

## Evidence
- The Notes spike moved from `apps/notes/` to `spikes/notes-block-editing-collaboration-poc/`. `npm run check` reports no spike projects, and `npx nx run-many -t typecheck test build -p 'tag:spike'` still passes.

## Consequences
- A bare `npx nx run-many -t <target>` still includes spikes, because Nx has no setting that excludes projects by default. The `npm run` scripts are the repo-wide commands.
- A spike's dependencies stay in `package-lock.json`, and `npm install` still installs them.
- A spike that stops building is fixed or deleted, not worked around in the repo-wide scripts.
