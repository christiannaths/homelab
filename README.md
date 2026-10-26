# Homelab

Self-hosted apps for a homelab, and the platform that runs them, in one [Nx](https://nx.dev) monorepo. Each app is built, tested and shipped as its own container, and an app never depends on another app or on the platform ([ADR-PLAT-002](docs/adr/ADR-PLAT-002-repo-structure.md)). It plugs in through the app contract alone ([ADR-PLAT-009](docs/adr/ADR-PLAT-009-app-contract.md)).

## Apps

| App | What it is |
| --- | --- |
| [`notes`](apps/notes/README.md) | **LocalNotion**: an offline-first, multiplayer Notion-style workspace (starting fresh) |
| [`encyclopedia`](apps/encyclopedia/README.md) | **Encyclopedia**: a read-only copy of Wikipedia, already populated, with saved lists that work offline (docs only) |

## Platform

Everything around the apps, in `platform/`.

| Part | What it is |
| --- | --- |
| [`accounts`](platform/accounts/README.md) | **Accounts**: the homelab account, where people sign in, and who may open which app |
| [`home`](platform/home/README.md) | **Home**: the apps each person can use, as tiles, open to every homelab account; an install can leave it out |
| [`gateway`](platform/gateway/README.md) | **The gateway**: the homelab's Caddy, which asks the accounts service about every request and adds the App switcher |
| [`app-switcher`](platform/app-switcher/README.md) | **App switcher**: the tab at the top of every app |
| [`app-manifests`](platform/app-manifests) | Reading apps' manifests, for the accounts service's `/api/me`, account page and People page |
| [`e2e`](platform/e2e) | The platform's end-to-end suite, across apps |

## App ideas

Ideas that have been talked through but not committed to. Nothing here is planned or promised, and any of it may change or be dropped. The apps are meant for a household: one person plus the family or housemates they share things with. Where an existing FOSS app is a natural fit and covers the main use cases, homelab bundles it behind the shared sign-in instead of building its own.

| Idea | What it would be | Notes |
| --- | --- | --- |
| **Search across apps** | One search on Home that finds things in every app | Home exists; the search does not. |
| **Library** | The things a household saves from elsewhere and reads later: ebooks, and read-later web pages kept offline in full | Pocket is a loose reference for read-later. It would link to Encyclopedia, and a "send to Notes" action would clip a page into Notes. |
| **Photos and videos** | The household's shared library of photos and home videos | Definitely wanted. Immich is the candidate to bundle. |
| **Media** | Movies and TV: a library the household watches from, which also finds and fetches new episodes and films people ask for | In the spirit of Sonarr or Sick Beard plus Plex. Likely bundles Sonarr, Radarr and Jellyfin, with a small household request page built on top. Also worth a look: [a TorBox and Stremio how-to guide](https://arnav.au/2026/05/16/torbox-stremio-how-to-guide/). |
| **Offline maps** | Maps of the household's region that work with no network, with search and saved places | Built on OpenStreetMap data. Pairs naturally with Encyclopedia. |
| **Cooking** | The principles of cooking and flavour rather than a pile of recipes: a few bases (such as the mother sauces) that branch into many dishes | Likely its own app, so it can show the branching map and scale ratios. A plain recipe app is not the goal: recipes would hang off the branches they come from. References: _Ratio_, _Salt Fat Acid Heat_, _The Flavor Bible_. |
| **Passwords** | A shared household password vault that works with the Bitwarden apps on phones and browsers | Bundles Vaultwarden rather than building one. |
| **Budgets** | The household's shared budget and spending | Bundles Actual Budget rather than building one. |

Some ideas need no app of their own because they fit in `notes`, a Notion-style workspace: a knowledge base (one workspace), household coordination (lists, chores and plans as pages and databases) and household papers (manuals, warranties, receipts and records). Notes holds what the household writes, and Library holds what it keeps from elsewhere.

Encyclopedia stays its own app rather than joining Library. That keeps its GPL licence out of Library, and its content (chosen by the admin and updated monthly) is different from what household members add themselves.

Undecided: a shared calendar that syncs to phones, which Notes may not cover well.

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
npm run test:e2e          # every app's and the platform's end-to-end tests
npm run dev               # the whole homelab on this machine, to try by hand (see tools/dev/README.md)
```

Run one project's task with `npx nx <target> <project>` (for example `npx nx typecheck tools`), every project's with `npx nx run-many -t <target>`, and `npx nx graph` to see how projects depend on each other.

## Layout

```text
apps/<app>/          one app: npm workspace packages (web, server, e2e), its docs and, once it ships, its Dockerfile
platform/            the platform around the apps: accounts, Home, the gateway, the App switcher, manifest reading and its e2e suite
packages/            libraries apps may use
spikes/<spike>/      a frozen proof of concept, laid out like an app and skipped by repo-wide commands
docs/adr/            platform ADRs, which hold for every app, and the ADR format
tools/               repo scripts (TypeScript, run directly by Node)
tools/dev/           every app behind the gateway on this machine, for trying by hand (`npm run dev`)
```

Each app's decisions, specs and research live in `apps/<app>/docs/`.
