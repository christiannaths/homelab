# Notes: access model on per-person sync (spike)

A throwaway spike for [issue #11](https://github.com/christiannaths/homelab/issues/11): can Notion's access model (Notes [ADR 13](../../apps/notes/docs/adr/0013-access-control.md) and [ADR 14](../../apps/notes/docs/adr/0014-page-permissions.md)) be built on Yjs documents synced whole by Hocuspocus, when each device may only receive the pages its person can open? It starts from a copy of the frozen [block editing spike](../notes-block-editing-collaboration-poc/README.md), and is left out of repo-wide runs ([ADR 16](../../docs/adr/0016-proof-of-concept-code.md)).

> Status: **frozen.** Its findings are in [`apps/notes/docs/research/07-access-spike-findings.md`](../../apps/notes/docs/research/07-access-spike-findings.md), and its decisions in the [Notes ADRs](../../apps/notes/docs/adr/README.md): [ADR 13](../../apps/notes/docs/adr/0013-access-control.md), [ADR 14](../../apps/notes/docs/adr/0014-page-permissions.md), [ADR 17](../../apps/notes/docs/adr/0017-data-layout.md) (the document split), [ADR 1](../../apps/notes/docs/adr/0001-offline-use.md) (offline) and [ADR 12](../../apps/notes/docs/adr/0012-sync-and-access-checks.md) (sync). This code is kept for reference and still builds, but it is not maintained and nothing outside it may import from it. It is left out of the repo-wide `npm run build`, `typecheck`, `test`, `test:e2e` and `check`; run its projects by name, as below.

## Packages
- `model` (`notes-access-sync-poc-model`): pure TypeScript, no DOM. The page tree, the workspace document helpers, the people rules and the **access rules** (`access.ts`).
- `server` (`notes-access-sync-poc-server`): Hocuspocus with SQLite storage, run straight from TypeScript (`node src/index.ts`). Also holds the **sync-boundary** test helpers in `testing/`.
- `web` (`notes-access-sync-poc-web`): the React PWA, with BlockNote and offline storage in IndexedDB.
- `e2e` (`notes-access-sync-poc-e2e`): **two-browser** Playwright tests against real server processes.

## Identity is faked
On a new workspace the app asks for the first person, who becomes the workspace owner. The owner adds members and guests under People. Anyone opening the app picks who they are from a list. The person's id is the connection token, and the server trusts it.

## Where access data lives (#15)
- **The access set on a page lives in that page's own document**, in an `access` Y.Map beside `meta` and `content`: ## How it is organised
- **Documents** ([ADR 17](../../apps/notes/docs/adr/0017-data-layout.md) has the full layout): `page:<id>` per page (`meta`, `access`, `content`; a database page also holds its views, and each database row is a page of kind `row`), `index:<personId>` per person (written only by the server), `teamspace:<id>` per teamspace, and `schema:<databaseId>` per database (its properties). There is no workspace-wide document. People are a SQLite table on the server, not Yjs.
- **`model/src/`**: `access.ts` (levels per page, sidebar sections, which documents a person may open), `review.ts` (whether an update may be applied: refusals, placement and moves), `updates.ts` (what an update would change), `workspace.ts` (reading and writing page documents and indexes), `tree.ts` (the derived tree), `people.ts`, `teamspaces.ts`, `overrides.ts` (the Share menu's entries, breadcrumbs) and `database.ts`.
- **`server/src/`**: `server.ts` (Hocuspocus hooks: `onAuthenticate` per document, `beforeSync` per update, `applyAccessChanges` after access changes, and the people HTTP API), `catalog.ts` (every page's `meta` and `access`, and every teamspace, in memory, with each person's levels) and `store.ts` (SQLite).
- **`web/src/sync/`**: `SyncManager.ts` (one provider and IndexedDB store per document; `recover` after a refusal, `lose` after losing access, `wipe` on removal or switching person), `pages.ts` (`LocalPages`: follows the index and the page documents), `lostEdits.ts` (unsynced edits offered back) and `context.tsx` (React hooks).
- **Three test seams:** the access rules (Vitest, `model/src/*.test.ts`), the sync boundary (Vitest, `server/testing/`: `TestServer` runs a real server process, and `connectAs` connects a memory-only Node client as one person) and two browsers (Playwright, `e2e/tests/`, against real server processes).

## Findings and decisions
What the spike found, with the evidence for each claim, is in [`07-access-spike-findings.md`](../../apps/notes/docs/research/07-access-spike-findings.md), including the timings at 2,000 pages (risk 3) and the choices Notion doesn't document. The options it rejected are in [ADR 17](../../apps/notes/docs/adr/0017-data-layout.md) (where data lives) and the findings (risk 2, for recovering from a refusal). What it changed in the sync and offline decisions is in the Changelog of [ADR 12](../../apps/notes/docs/adr/0012-sync-and-access-checks.md) and [ADR 1](../../apps/notes/docs/adr/0001-offline-use.md).

tp://localhost:3000, data in spikes/notes-access-sync-poc/data
```

## Tests
```sh
npx nx run-many -t typecheck test -p 'tag:scope:notes-access-sync-poc'   # unit and sync-boundary tests
npx nx e2e notes-access-sync-poc-e2e   # builds the web app, then runs Playwright
SLOW=1 npx nx e2e notes-access-sync-poc-e2e -- access-scale   # the 2,000-page timing test (~2 min)
```
Set `PLAYWRIGHT_CHROMIUM_PATH` to use an already-installed Chromium.
