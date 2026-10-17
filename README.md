# Homelab

Self-hosted apps for a homelab, in one [Nx](https://nx.dev) monorepo. Each app is built, tested and shipped as its own container, and apps never depend on each other ([ADR 15](docs/adr/0015-repo-structure.md)).

## Apps
| App | What it is |
|---|---|
| [`notes`](apps/notes/README.md) | **LocalNotion**: an offline-first, multiplayer Notion-style workspace (starting fresh) |

## Spikes
Throwaway proofs of concept that settled an app's decisions. They are kept frozen and still build, but repo-wide commands skip them ([ADR 16](docs/adr/0016-proof-of-concept-code.md)).

| Spike | What it settled |
|---|---|
| [`notes-block-editing-collaboration-poc`](spikes/notes-block-editing-collaboration-poc/README.md) | Offline sync, block editing and live collaboration for `notes` |

## Setup
Requires **Node.js 26+**. With [mise](https://mise.jdx.dev), run `mise install` in the repo root (it reads `mise.toml`); with nvm, run `nvm install` (it reads `.nvmrc`). Then:

```sh
npm install
npm run check             # module boundaries, typecheck and unit tests for every project except spikes
npm run build
npm run test:e2e          # every app's end-to-end tests
```
Run one project's task with `npx nx <target> <project>` (for example `npx nx typecheck tools`), every project's with `npx nx run-many -t <target>`, and `npx nx graph` to see how projects depend on each other.

## Layout
```
apps/<app>/          one app: npm workspace packages (web, server, e2e), its Dockerfile and its docs
packages/            code shared by more than one app
spikes/<spike>/      a frozen proof of concept, laid out like an app and skipped by repo-wide commands
docs/adr/            platform ADRs, which hold for every app, and the ADR format
tools/               repo scripts (TypeScript, run directly by Node)
```
Each app's decisions, specs and research live in `apps/<app>/docs/`.
