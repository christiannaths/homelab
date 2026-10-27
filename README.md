# Homelab

Self-hosted household apps and the platform that runs them, in one [Nx](https://nx.dev) monorepo. Each app is its own container, depends on no other app or the platform ([ADR-PLAT-002](docs/adr/ADR-PLAT-002-repo-structure.md)), and plugs in through the app contract ([ADR-PLAT-009](docs/adr/ADR-PLAT-009-app-contract.md)).

| App | What it is |
| --- | --- |
| [`notes`](apps/notes/README.md) | **LocalNotion**: offline-first, multiplayer Notion-style workspace (starting fresh) |
| [`encyclopedia`](apps/encyclopedia/README.md) | **Encyclopedia**: read-only, pre-populated Wikipedia with offline saved lists (docs only) |

| Platform (`platform/`) | What it is |
| --- | --- |
| [`accounts`](platform/accounts/README.md) | Sign-in, homelab accounts, App access |
| [`home`](platform/home/README.md) | Tiles for each person's apps; optional |
| [`gateway`](platform/gateway/README.md) | Caddy: sign-in check on every request, injects the App switcher |
| [`app-switcher`](platform/app-switcher/README.md) | The tab at the top of every app |
| [`app-manifests`](platform/app-manifests) | Reads apps' manifests for `/api/me`, the account page and People page |
| [`e2e`](platform/e2e) | Cross-app end-to-end suite |

## App ideas

Talked through, not committed to; any may change or be dropped. Apps are for a household (one person plus family or housemates). Where a FOSS app covers the main use cases, homelab bundles it behind the shared sign-in.

| Idea | What it would be | Notes |
| --- | --- | --- |
| **Search across apps** | One search that finds things in every app | Needs a page of its own (Home was retired in #128) and apps exposing search through the [app contract](docs/adr/ADR-PLAT-009-app-contract.md). |
| **Library** | What a household saves from elsewhere to read later: ebooks, and read-later web pages kept offline in full | Pocket is a loose reference for read-later. Links to Encyclopedia; a "send to Notes" action clips a page into Notes. |
| **Photos and videos** | The household's shared library of photos and home videos | Definitely wanted. Immich is the candidate to bundle. |
| **Media** | Movies and TV: a library the household watches from, which also finds and fetches new episodes and films people ask for | In the spirit of Sonarr or Sick Beard plus Plex. Likely bundles Sonarr, Radarr and Jellyfin, with a small household request page on top. Also worth a look: [a TorBox and Stremio how-to guide](https://arnav.au/2026/05/16/torbox-stremio-how-to-guide/). |
| **Offline maps** | Maps of the household's region that work with no network, with search and saved places | Built on OpenStreetMap data. Pairs naturally with Encyclopedia. |
| **Cooking** | The principles of cooking and flavour, not a pile of recipes: a few bases (such as the mother sauces) that branch into many dishes | Likely its own app, to show the branching map and scale ratios. Not a plain recipe app: recipes hang off the branches they come from. References: _Ratio_, _Salt Fat Acid Heat_, _The Flavor Bible_. |
| **Passwords** | A shared household password vault that works with the Bitwarden apps on phones and browsers | Bundles Vaultwarden. |
| **Budgets** | The household's shared budget and spending | Bundles Actual Budget. |

- **Fits in `notes`, no app needed:** a knowledge base (one workspace), household coordination (lists, chores, plans as pages and databases), household papers (manuals, warranties, receipts, records). Notes holds what the household writes; Library holds what it keeps from elsewhere.
- **Encyclopedia stays separate from Library:** keeps its GPL licence out of Library, and its content (admin-chosen, updated monthly) differs from what members add.
- **Undecided:** a shared calendar that syncs to phones, which Notes may not cover well.

## Spikes

Frozen proofs of concept that still build; repo-wide commands skip them ([ADR-PLAT-003](docs/adr/ADR-PLAT-003-proof-of-concept-code.md)).

| Spike | What it settled |
| --- | --- |
| [`notes-block-editing-collaboration-poc`](spikes/notes-block-editing-collaboration-poc/README.md) | Offline sync, block editing and live collaboration for `notes` |

## Inspiration

- [Project N.O.M.A.D.: a self-hosted internet in a box](https://readthemanual.co.uk/project-nomad-self-hosted-internet-in-a-box/)

## Setup

Requires **Node.js 26+**: `mise install` (reads `mise.toml`) or `nvm install` (reads `.nvmrc`). Then:

```sh
npm install               # also installs the pre-commit hook, which formats and lints staged files
npm run check             # formatting, lint, module boundaries, ADR rules, then typecheck and unit tests for every project except spikes
npm run fix               # applies Prettier and every linter's safe fixes
npm run build
npm run test:e2e          # every app's and the platform's end-to-end tests
npm run dev               # the whole homelab on this machine, to try by hand (see tools/dev/README.md)
```

One project: `npx nx <target> <project>` (e.g. `npx nx typecheck tools`). All: `npx nx run-many -t <target>`. Graph: `npx nx graph`.

## Layout

```text
apps/<app>/          one app: npm workspace packages (web, server, e2e), its docs and, once it ships, its Dockerfile
platform/            the platform around the apps: accounts, the gateway, the App switcher, manifest reading and its e2e suite
packages/            libraries apps may use
spikes/<spike>/      a frozen proof of concept, laid out like an app and skipped by repo-wide commands
docs/adr/            platform ADRs, which hold for every app, and the ADR format
tools/               repo scripts (TypeScript, run directly by Node)
tools/dev/           every app behind the gateway on this machine, for trying by hand (`npm run dev`)
```

App docs (ADRs, specs, research): `apps/<app>/docs/`.
