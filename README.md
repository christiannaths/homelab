# LocalNotion

A lean, self-hosted Notion-style workspace for homelabs. **Offline-first**: every device keeps a full copy of the workspace. **Multiplayer**: edits and cursors sync live between users.

> Status: **prototype spike.** See [`research/`](research) for the landscape survey, requirements, architecture and the spike's findings.

## How it works (so far)
- **Client**: a React PWA (Vite). Every page is a [Yjs](https://yjs.dev) document, edited with [BlockNote](https://www.blocknotejs.org) and stored in IndexedDB. A service worker caches the app, so it opens with no network.
- **Server**: Node + [Hocuspocus](https://tiptap.dev/docs/hocuspocus) relays updates over one WebSocket and stores each document in SQLite. It also serves the built app.
- Clients sync the **whole workspace** in the background, so every page is available offline.

## Run it
Requires **Node.js 26+** (the server uses the built-in `node:sqlite`). With nvm, run `nvm install` in the repo root (it reads `.nvmrc`).

```sh
npm install
npm run build
npm start                 # http://localhost:3000, data in ./data
```
Development (hot reload): `npm run dev:server` and `npm run dev:web` (http://localhost:5173). The service worker only exists in the production build.

With Docker:
```sh
docker compose up -d --build   # data persisted in ./data
```

For Safari/iOS to install the app and keep data offline, it must be served over **HTTPS with a trusted certificate**. Two options:
- `tailscale serve --bg 3000`
- Caddy with a DNS-01 challenge

## Tests
```sh
npm run typecheck
npm run test:e2e          # builds, then runs Playwright against real server processes
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
