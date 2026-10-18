# ADR-PLAT-003. How is proof-of-concept code kept apart from the apps?

- Status: Accepted
- Date: 2026-10-17
- Depends on: [ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)
- Dependency of: [ADR-PLAT-005](ADR-PLAT-005-code-quality.md)

## Context

An app's decisions are often settled by throwaway spikes before the app itself is built. A spike is worth keeping as a record of how a decision was tested, and worth keeping buildable so that it can be rerun. It must not slow down or break the repo-wide build and tests, and the real app must not grow out of it by accident. Formatting and linting are cheap enough to cover spikes too, so that `npm run check` can vouch for every file in the repo.

## Decision

- **Layout:** `spikes/<spike>/` holds one spike, split into npm workspace packages such as `web`, `server` and `e2e`, like an app in `apps/` ([ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)). A spike for one app is named after it, starting with the app's name (for example `notes-block-editing-collaboration-poc`).
- Each package is still an npm workspace and an Nx project, named `<spike>-<package>`, so it installs, builds and tests by name (`npx nx build <spike>-web`).
- **Tags:** every spike project has `scope:<spike>`, the tag `spike`, and a `platform:` tag. Its own scope means the boundary check already stops apps and shared packages from depending on it.
- **Repo-wide builds and tests skip spikes.** The root `build`, `typecheck`, `test` and `test:e2e` scripts, and the Nx part of `check`, pass `--exclude=tag:spike` to `nx run-many`.
- **Formatting and linting cover spikes** like the rest of the repo ([ADR-PLAT-005](ADR-PLAT-005-code-quality.md)). A rule whose violations in a spike cannot be fixed without rewriting it is switched off for `spikes/**` in that tool's config.
- A spike is frozen once its decisions are recorded: it is kept for reference and not maintained beyond formatting and lint fixes. Its decisions and findings live in the app's `docs/`, not in the spike.

## Evidence

- The Notes spike moved from `apps/notes/` to `spikes/notes-block-editing-collaboration-poc/`. The Nx part of `npm run check` reports no spike projects, and `npx nx run-many -t typecheck test build -p 'tag:spike'` still passes.
- After the formatting and lint cleanup, which renamed six spike files to kebab-case, typecheck and unit tests still pass for every spike project.

## Consequences

- A bare `npx nx run-many -t <target>` still includes spikes, because Nx has no setting that excludes projects by default. The `npm run` scripts are the repo-wide commands.
- A spike's dependencies stay in `package-lock.json`, and `npm install` still installs them.
- A spike that stops building is fixed or deleted, not worked around in the repo-wide scripts.

## Changelog

- 2026-10-17: Formatting and linting cover spikes, instead of spikes staying out of every repo-wide run. Prettier, Oxlint, markdownlint, Stylelint and ls-lint run over the whole repo ([ADR-PLAT-005](ADR-PLAT-005-code-quality.md)), so that `npm run check` and the pre-commit hook hold every file to the same rules. Builds and tests still skip spikes. Evidence: PR #44.
- 2026-10-16: Accepted. Spikes lived in `spikes/`, and every repo-wide script, `check` included, skipped them.
