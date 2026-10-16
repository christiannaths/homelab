# Homelab

Self-hosted apps for a homelab, in one [Nx](https://nx.dev) monorepo. Each app is built, tested and shipped as its own container, and apps never depend on each other ([ADR 15](docs/adr/0015-nx-monorepo.md)).

## Apps
| App | What it is |
|---|---|
| [`notes`](apps/notes/README.md) | **LocalNotion**: an offline-first, multiplayer Notion-style workspace |

## Setup
Requires **Node.js 26+**. With [mise](https://mise.jdx.dev), run `mise install` in the repo root (it reads `mise.toml`); with nvm, run `nvm install` (it reads `.nvmrc`). Then:

```sh
npm install
npm run check             # module boundaries, typecheck and unit tests for every project
npm run build
npm run test:e2e          # every app's end-to-end tests
```
Run one project's task with `npx nx <target> <project>` (for example `npx nx start notes-server`), every project's with `npx nx run-many -t <target>`, and `npx nx graph` to see how projects depend on each other.

## Layout
```
apps/<app>/          one app: npm workspace packages (web, server, e2e), its Dockerfile and its docs
packages/            code shared by more than one app
docs/adr/            platform ADRs, which hold for every app, and the ADR format
tools/               repo scripts (TypeScript, run directly by Node)
```
Each app's decisions, specs and research live in `apps/<app>/docs/`.
