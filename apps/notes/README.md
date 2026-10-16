# LocalNotion

A lean, self-hosted Notion-style workspace for homelabs. **Offline-first**: every device keeps a full copy of the workspace. **Multiplayer**: edits and cursors sync live between users.

The `notes` app in the [homelab monorepo](../../README.md).

> Status: **prototype spikes.** Settled decisions are recorded as ADRs, including what's deliberately *not* decided yet: [`docs/adr/`](docs/adr/README.md) for LocalNotion, and the [platform ADRs](../../docs/adr/README.md) for the whole repo. [`docs/research/`](docs/research) holds the landscape survey, requirements, architecture sketch and spike findings, and [`docs/specs/`](docs/specs) the feature specs.

## How it works (so far)
- **Client**: a React PWA (Vite). Every page is a [Yjs](https://yjs.dev) document, edited with [BlockNote](https://www.blocknotejs.org) and stored in IndexedDB. A service worker caches the app, so it opens with no network.
- **Server**: Node + [Hocuspocus](https://tiptap.dev/docs/hocuspocus) relays updates over one WebSocket and stores each document in SQLite. It also serves the built app.
- Clients sync the **whole workspace** in the background, so every page is available offline.
- **Nested pages** with drag-and-drop reordering, plus trash. Concurrent moves that would form a cycle are repaired the same way on every device.
- **Databases** with text, number, select, checkbox and date properties, a virtualized table view (sort and filter), and rows that open as pages.

## Run it
Requires **Node.js 26+** (the server uses the built-in `node:sqlite`); see the [repo README](../../README.md) for setup. From the repo root:

```sh
npm install
npx nx start notes-server  # builds, then serves http://localhost:3000, data in apps/notes/data
```
Development (hot reload): `npx nx dev notes-server` and `npx nx dev notes-web` (http://localhost:5173). The service worker only exists in the production build.

With Docker:
```sh
cd apps/notes
docker compose up -d --build   # data persisted in apps/notes/data
```

For Safari/iOS to install the app and keep data offline, it must be served over **HTTPS with a trusted certificate**. Two options:
- `tailscale serve --bg 3000`
- Caddy with a DNS-01 challenge

## Tests
From the repo root:
```sh
npx nx typecheck notes-web
npx nx test notes-web     # unit tests (Vitest): tree, ordering, database views, CRDT convergence
npx nx e2e notes-e2e      # builds, then runs Playwright against real server processes
```
The end-to-end tests cover:
- live co-editing and presence
- a cold start with no network
- offline edits merging when the device reconnects
- edits made while the server is down, and data surviving server restarts
- sync and startup timings with 200+ documents

## Install on your devices
- **macOS** (Safari 17+): open the site, then *File → Add to Dock*.
- **iOS**: open the site in Safari, then *Share → Add to Home Screen*.
- The **Diagnostics** page in the sidebar shows sync status, storage persistence, quota, and load-test buttons.
