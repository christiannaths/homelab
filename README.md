# Homelab

Self-hosted apps for a homelab, in one [Nx](https://nx.dev) monorepo. Each app is built, tested and shipped as its own container, and apps never depend on each other ([ADR-PLAT-002](docs/adr/ADR-PLAT-002-repo-structure.md)).

## Apps

| App | What it is |
| --- | --- |
| [`notes`](apps/notes/README.md) | **LocalNotion**: an offline-first, multiplayer Notion-style workspace (starting fresh) |
| [`encyclopedia`](apps/encyclopedia/README.md) | **Encyclopedia**: a read-only copy of Wikipedia, already populated, with saved lists that work offline (docs only) |

## App ideas

Ideas that have been talked through but not committed to. Nothing here is planned or promised, and any of it may change or be dropped. The apps are meant for a household: one person plus the family or housemates they share things with.

| Idea | What it would be | Notes |
| --- | --- | --- |
| **Library** | The things a household saves from elsewhere and reads later: ebooks, and read-later web pages kept offline in full | Pocket is a loose reference for read-later. It would link to Encyclopedia, and a "send to Notes" action would clip a page into Notes. |
| **Knowledge base** | Not a separate app: one workspace inside `notes` | Notes is what the household writes, and Library is what it keeps. |
| **Household coordination** | Not a separate app: lists, chores and plans as pages and databases in `notes` | A shared calendar that syncs to phones is the one part Notes may not cover well. |

Encyclopedia stays its own app rather than joining Library. That keeps its GPL licence out of Library, and its content (chosen by the admin and updated monthly) is different from what household members add themselves.

## Spikes

Throwaway proofs of concept that settled an app's decisions. They are kept frozen and still build, but repo-wide commands skip them ([ADR-PLAT-003](docs/adr/ADR-PLAT-003-proof-of-concept-code.md)).

| Spike | What it settled |
| --- | --- |
| [`notes-block-editing-collaboration-poc`](spikes/notes-block-editing-collaboration-poc/README.md) | Offline sync, block editing and live collaboration for `notes` |

## Inspiration

- [Project N.O.M.A.D.: a self-hosted internet in a box](https://readthemanual.co.uk/project-nomad-self-hosted-internet-in-a-box/)

## Setup

Requires **Node.js 26+**. With [mise](https://mise.jdx.dev), run `mise install` in the repo root (it reads `mise.toml`); with nvm, run `nvm install` (it reads `.nvmrc`). Then:

```sh
npm install               # also installs the pre-commit hook, which formats and lints staged files
npm run check             # formatting, lint, module boundaries, ADR rules, then typecheck and unit tests for every project except spikes
npm run fix               # applies Prettier and every linter's safe fixes
npm run build
npm run test:e2e          # every app's end-to-end tests
```

Run one project's task with `npx nx <target> <project>` (for example `npx nx typecheck tools`), every project's with `npx nx run-many -t <target>`, and `npx nx graph` to see how projects depend on each other.

## Layout

```text
apps/<app>/          one app: npm workspace packages (web, server, e2e), its Dockerfile and its docs
packages/            code shared by more than one app
spikes/<spike>/      a frozen proof of concept, laid out like an app and skipped by repo-wide commands
docs/adr/            platform ADRs, which hold for every app, and the ADR format
tools/               repo scripts (TypeScript, run directly by Node)
```

Each app's decisions, specs and research live in `apps/<app>/docs/`.
