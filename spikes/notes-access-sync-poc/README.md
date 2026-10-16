# Notes: access model on per-person sync (spike)

A throwaway spike for [issue #11](https://github.com/christiannaths/homelab/issues/11): can Notion's access model (Notes [ADR 13](../../apps/notes/docs/adr/0013-notion-style-access.md) and [ADR 14](../../apps/notes/docs/adr/0014-notion-page-access-levels.md)) be built on Yjs documents synced whole by Hocuspocus, when each device may only receive the pages its person can open? It starts from a copy of the frozen [block editing spike](../notes-block-editing-collaboration-poc/README.md), and is left out of repo-wide runs ([ADR 16](../../docs/adr/0016-spikes-stay-out-of-repo-wide-runs.md)).

## Packages
- `model` (`notes-access-sync-poc-model`): pure TypeScript, no DOM. The page tree, the workspace document helpers, the people rules and the **access rules** (`access.ts`).
- `server` (`notes-access-sync-poc-server`): Hocuspocus with SQLite storage, run straight from TypeScript (`node src/index.ts`). Also holds the **sync-boundary** test helpers in `testing/`.
- `web` (`notes-access-sync-poc-web`): the React PWA, with BlockNote and offline storage in IndexedDB.
- `e2e` (`notes-access-sync-poc-e2e`): **two-browser** Playwright tests against real server processes.

## Identity is faked
On a new workspace the app asks for the first person, who becomes the workspace owner. The owner adds members and guests under People. Anyone opening the app picks who they are from a list. The person's id is the connection token, and the server trusts it.

## Run it
From the repo root (Node.js 26+):
```sh
npm install
npx nx build notes-access-sync-poc-web
npx nx start notes-access-sync-poc-server   # http://localhost:3000, data in spikes/notes-access-sync-poc/data
```

## Tests
```sh
npx nx run-many -t typecheck test -p 'tag:scope:notes-access-sync-poc'   # unit and sync-boundary tests
npx nx e2e notes-access-sync-poc-e2e   # builds the web app, then runs Playwright
```
Set `PLAYWRIGHT_CHROMIUM_PATH` to use an already-installed Chromium.
