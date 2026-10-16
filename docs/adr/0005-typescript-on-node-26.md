# 5. TypeScript everywhere, on Node.js 26, with npm, in one workspaces repo

- Status: Accepted
- Date: 2026-10-16

## Context
Client and server share data-model code and Yjs, and the project is maintained by a very small team.

## Decision
- **TypeScript** for the client, the server and the tests.
- **Node.js 26** (LTS from 2026-10-28) is the minimum version. It's enforced through `engines`/`devEngines` (so `npm install` fails on older Node), `.nvmrc`, a version check at server startup, and the Docker base image.
- **npm**, the package manager bundled with Node, in its default `node_modules` layout. Dependencies' install scripts run only when approved in `allowScripts` (`npm approve-scripts`).
- **One repo using npm workspaces:** `apps/web` and `apps/server`. Shared code moves into a workspace package when the server needs it.
- Avoid dependencies that compile native code. Prefer what Node provides, e.g. `node:sqlite` (ADR 6).

## Evidence
- Node 25 reached end of life on 2026-06-01, and Node 22.12 lacked `node:sqlite`. Requiring Node 26 fixed the startup crash reported against PR #1.
- The suite passes on Node 26.12.0: typecheck, 18 unit tests and 11 e2e tests.
- **Bun 1.4.3 as the runtime was rejected.** It runs our code, including `node:sqlite`, but Hocuspocus's server refuses to start on Bun. Running it meant a Bun-only server entry and a socket adapter, and in the 2,000-page test the Bun server failed to complete a client-initiated close on the second reconnect cycle. Node needs none of that.
- **npm was compared with pnpm 12, Yarn 4 and Bun's installer** (all with Node as the runtime), on this repo:
  - pnpm and Bun installed fastest (warm cache: 1.6 s and 0.6 s, vs ~11 s for npm).
  - All four pass the full suite.
  - npm won on needing no extra tooling. Node 25+ no longer bundles Corepack, so any other package manager is an extra install on every machine, in CI and in Docker.

## Consequences
- Contributors need Node 26 (`nvm install`).
- Moving to the next LTS is a deliberate version bump.
- npm's flat `node_modules` lets code import packages it never declared, and npm's strict `install-strategy=linked` mode isn't usable yet (it broke React peer resolution in our test). **Every package a workspace imports must be in its own `package.json`, including peer dependencies of tools.** pnpm's strict layout caught exactly that case: `vite-plugin-pwa` imports `workbox-window`, which we hadn't declared.
