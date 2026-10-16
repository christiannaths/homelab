# 6. TypeScript everywhere, on Node.js 26, in one npm-workspaces repo

- Status: Accepted
- Date: 2026-10-16

## Context
Client and server share data-model code and Yjs, and the project is maintained by a very small team.

## Decision
- **TypeScript** for the client, the server and the tests.
- **Node.js 26** (LTS from 2026-10-28) is the minimum version. It's enforced through `engines`/`devEngines` (so `npm install` fails on older Node), `.nvmrc`, a version check at server startup, and the Docker base image.
- **One repo using npm workspaces:** `apps/web` and `apps/server`. Shared code moves into a workspace package when the server needs it.
- Avoid dependencies that compile native code. Prefer what Node provides, e.g. `node:sqlite` (ADR 7).

## Evidence
- Node 25 reached end of life on 2026-06-01, and Node 22.12 lacked `node:sqlite`. Requiring Node 26 fixed the startup crash reported against PR #1.
- The suite passes on Node 26.12.0: typecheck, 18 unit tests and 11 e2e tests.

## Consequences
- Contributors need Node 26 (`nvm install`).
- Moving to the next LTS is a deliberate version bump.
