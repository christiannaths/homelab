# ADR-PLAT-001. How is the code written, run and packaged?

- Status: Accepted
- Date: 2026-10-16
- Depends on: none
- Dependency of: [ADR-ENCY-002](../../apps/encyclopedia/docs/adr/ADR-ENCY-002-article-serving.md), [ADR-NOTE-005](../../apps/notes/docs/adr/ADR-NOTE-005-document-persistence.md), [ADR-NOTE-008](../../apps/notes/docs/adr/ADR-NOTE-008-model-correctness.md), [ADR-NOTE-014](../../apps/notes/docs/adr/ADR-NOTE-014-http-and-accounts.md), [ADR-PLAT-002](ADR-PLAT-002-repo-structure.md), [ADR-PLAT-005](ADR-PLAT-005-app-settings.md), [ADR-PLAT-006](ADR-PLAT-006-code-quality.md)

## Context

Client and server share data-model code and Yjs. A very small team maintains the project.

## Decision

- **TypeScript** for client, server and tests.
- **Node.js 26** (LTS from 2026-10-28) minimum, enforced by `engines` and `devEngines` (`npm install` fails on older Node), `mise.toml` and `.nvmrc`, a version check at server startup, and the Docker base image.
- **npm** (bundled with Node), default `node_modules` layout. Dependency install scripts run only when approved in `allowScripts` (`npm approve-scripts`).
- **One repo, npm workspaces**, laid out per [ADR-PLAT-002](ADR-PLAT-002-repo-structure.md).
- Avoid dependencies that compile native code; use what Node provides, e.g. `node:sqlite` ([ADR-NOTE-005](../../apps/notes/docs/adr/ADR-NOTE-005-document-persistence.md)).

## Alternatives considered

- **Bun 1.4.3 as the runtime**: runs the code incl. `node:sqlite`, but Hocuspocus's server won't start on Bun. Fixing it needs a Bun-only server entry and a socket adapter, and in the 2,000-page test the Bun server failed to complete a client-initiated close on the second reconnect cycle.
- **pnpm 12, Yarn 4 or Bun's installer**: pnpm and Bun install fastest (warm cache 1.6 s and 0.6 s vs ~11 s for npm), but each is an extra install on every machine, in CI and in Docker, since Node 25+ no longer bundles Corepack.

## Evidence

- Node 25 reached end of life 2026-06-01; Node 22.12 lacks `node:sqlite`. Requiring Node 26 fixed the startup crash reported on PR #1.
- Full suite (typecheck, unit, e2e) passes on Node 26.12.0.
- pnpm 12, Yarn 4, Bun's installer and npm all passed the full suite here, with Node as runtime.

## Consequences

- Contributors need Node 26 (`mise install` or `nvm install`).
- Moving to the next LTS is a deliberate version bump.
- npm's flat `node_modules` lets code import undeclared packages, and strict `install-strategy=linked` isn't usable yet (broke React peer resolution in testing). **Every package a workspace imports must be declared in its `package.json`, incl. tools' peer dependencies.** pnpm's strict layout caught exactly this: `vite-plugin-pwa` imports `workbox-window`, which was undeclared.
