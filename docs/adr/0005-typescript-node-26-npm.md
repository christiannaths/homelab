# 5. The code is TypeScript on Node.js 26, in npm workspaces

- Status: Accepted
- Date: 2026-10-16
- Depends on: none
- Dependency of: [ADR 6](0006-sqlite-server-storage.md), [ADR 9](0009-pure-model-and-tests.md), [ADR 11](0011-local-password-accounts.md)

## Context
The client and the server share data-model code and Yjs, and a very small team maintains the project.

## Decision
- **TypeScript** is used for the client, the server and the tests.
- **Node.js 26** (LTS from 2026-10-28) is the minimum version. It is enforced by `engines` and `devEngines` (so `npm install` fails on older Node), `.nvmrc`, a version check at server startup, and the Docker base image.
- **npm**, the package manager bundled with Node, is used in its default `node_modules` layout. Dependencies' install scripts run only when approved in `allowScripts` (`npm approve-scripts`).
- **One repo uses npm workspaces:** `apps/web` and `apps/server`. Shared code moves into a workspace package when the server needs it.
- Dependencies that compile native code are avoided in favour of what Node provides, for example `node:sqlite` ([ADR 6](0006-sqlite-server-storage.md)).

## Evidence
- Node 25 reached end of life on 2026-06-01, and Node 22.12 lacks `node:sqlite`. Requiring Node 26 fixed the startup crash reported against PR #1.
- The suite passes on Node 26.12.0: typecheck, 18 unit tests and 11 e2e tests.
- **Bun 1.4.3 as the runtime was rejected.** It runs the code, including `node:sqlite`, but Hocuspocus's server refuses to start on Bun. Making it work needed a Bun-only server entry and a socket adapter, and in the 2,000-page test the Bun server failed to complete a client-initiated close on the second reconnect cycle. Node needs none of that.
- **npm was compared with pnpm 12, Yarn 4 and Bun's installer**, all with Node as the runtime, on this repo:
  - pnpm and Bun installed fastest (warm cache: 1.6 s and 0.6 s, against about 11 s for npm).
  - All four passed the full suite.
  - npm won on needing no extra tooling. Node 25 and later no longer bundle Corepack, so any other package manager is an extra install on every machine, in CI and in Docker.

## Consequences
- Contributors need Node 26 (`nvm install`).
- Moving to the next LTS is a deliberate version bump.
- npm's flat `node_modules` lets code import packages it never declared, and npm's strict `install-strategy=linked` mode is not usable yet (it broke React peer resolution in testing). **Every package a workspace imports must be declared in that workspace's `package.json`, including peer dependencies of tools.** pnpm's strict layout caught exactly that case: `vite-plugin-pwa` imports `workbox-window`, which was undeclared.
