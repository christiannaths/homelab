# ADR-PLAT-001. How is the code written, run and packaged?

- Status: Accepted
- Date: 2026-10-16
- Depends on: none
- Dependency of: [ADR-NOTE-005](../../apps/notes/docs/adr/ADR-NOTE-005-document-persistence.md), [ADR-NOTE-008](../../apps/notes/docs/adr/ADR-NOTE-008-model-correctness.md), [ADR-NOTE-009](../../apps/notes/docs/adr/ADR-NOTE-009-identity.md), [ADR-NOTE-014](../../apps/notes/docs/adr/ADR-NOTE-014-http-and-accounts.md), [ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)

## Context
The client and the server share data-model code and Yjs, and a very small team maintains the project.

## Decision
- **TypeScript** is used for the client, the server and the tests.
- **Node.js 26** (LTS from 2026-10-28) is the minimum version. It is enforced by `engines` and `devEngines` (so `npm install` fails on older Node), `mise.toml` and `.nvmrc`, a version check at server startup, and the Docker base image.
- **npm**, the package manager bundled with Node, is used in its default `node_modules` layout. Dependencies' install scripts run only when approved in `allowScripts` (`npm approve-scripts`).
- **One repo uses npm workspaces**, laid out as described in [ADR-PLAT-002](ADR-PLAT-002-repo-structure.md).
- Dependencies that compile native code are avoided in favour of what Node provides, for example `node:sqlite` ([ADR-NOTE-005](../../apps/notes/docs/adr/ADR-NOTE-005-document-persistence.md)).

## Evidence
- Node 25 reached end of life on 2026-06-01, and Node 22.12 lacks `node:sqlite`. Requiring Node 26 fixed the startup crash reported against PR #1.
- The full suite (typecheck, unit and e2e tests) passes on Node 26.12.0.
- pnpm 12, Yarn 4, Bun's installer and npm all passed the full suite on this repo, with Node as the runtime.

## Alternatives considered
- **Bun 1.4.3 as the runtime.** It runs the code, including `node:sqlite`, but Hocuspocus's server refuses to start on Bun. Making it work needs a Bun-only server entry and a socket adapter, and in the 2,000-page test the Bun server failed to complete a client-initiated close on the second reconnect cycle.
- **pnpm 12, Yarn 4 or Bun's installer.** pnpm and Bun install fastest (warm cache: 1.6 s and 0.6 s, against about 11 s for npm), but each is an extra install on every machine, in CI and in Docker, because Node 25 and later no longer bundle Corepack.

## Consequences
- Contributors need Node 26 (`mise install` or `nvm install`).
- Moving to the next LTS is a deliberate version bump.
- npm's flat `node_modules` lets code import packages it never declared, and npm's strict `install-strategy=linked` mode is not usable yet (it broke React peer resolution in testing). **Every package a workspace imports must be declared in that workspace's `package.json`, including peer dependencies of tools.** pnpm's strict layout caught exactly that case: `vite-plugin-pwa` imports `workbox-window`, which was undeclared.
