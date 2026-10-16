# Architecture sketch (draft v0)

Guiding principle: **the device holds the real data, and the server is a relay and backup.** Every read and write goes to local storage first. The network is used only to share changes, never to show or edit anything.

## Why Yjs
- Yjs is a **CRDT library** (MIT, JS/TS). It provides shared data types (`Y.Map`, `Y.Array`, `Y.Text`, `Y.XmlFragment`) that any number of copies can edit independently, including offline. All copies merge to the same result automatically, with no conflict prompts.
- It is **independent of storage and transport.** A document is a byte stream of updates. Storing it ("persistence") and sending it ("providers") are separate plug-ins:
  - client: `y-indexeddb`, or any key-value or blob store
  - server: any database that can hold binary blobs (SQLite, Postgres, LevelDB, S3 or plain files)
  - transport: WebSocket (Hocuspocus, y-websocket, y-sweet), WebRTC, or files sent by hand
- **No database lock-in.** What we do commit to is the Yjs *update format*. It is readable from JS and from the Rust port (`yrs`), which also has Python, Swift and other bindings. Exporting to Markdown/JSON is a planned feature anyway.
- It has the most mature editor bindings (ProseMirror/Tiptap/BlockNote, Lexical, CodeMirror) and presence/cursors built in.
- Alternatives we considered: **Loro** (better movable tree and history, fewer editor bindings) and **Automerge** (good, fewer rich-text bindings). We can revisit later. The sync layer will sit behind a small interface we own.

## Data model: everything is a Y.Doc

```
Workspace doc  (one per workspace, always synced)
  pages:   Y.Map<pageId, { parentId, order, title, icon, kind: "page"|"database", deletedAt }>
  members: Y.Map<userId, { name, color, role }>

Page doc       (one per page)
  content: Y.XmlFragment          ← BlockNote document

Database doc   (one per database)
  schema:  Y.Map<propId, { name, type, options }>
  views:   Y.Map<viewId, { type: "table"|"board", filters, sorts, groupBy, columns }>
  rows:    Y.Map<rowId, Y.Map<propId, value>>   ← every row's properties, so views can be queried locally
  (each row's body is its own Page doc, keyed by rowId)
```

- The page tree uses `parentId` plus a **fractional index** for `order`. Two people moving pages at the same time can create a cycle, so the client detects it and repairs it the same way on every device.
- Deleting moves a page to the trash (`deletedAt`). Permanent deletion is a server job.
- Each document has a `schemaVersion` field, and migrations run on the client when a document is loaded.

## Client (PWA: React + Vite + TypeScript)
- **App shell**: a service worker (vite-plugin-pwa / Workbox) precaches everything, so the app starts with no network.
- **Storage**: `y-indexeddb` per document. We call `navigator.storage.persist()`, show storage usage, and the app works fully without a server.
- **Sync manager**: one WebSocket that carries all documents (Hocuspocus supports this). It syncs **the whole workspace** in the background, so every page is available offline (fine at homelab scale). It reconnects with backoff, and the UI shows sync status.
- **Editor**: BlockNote core (MPL-2.0). We avoid the GPL "XL" packages.
- **Database views**: computed locally from the database document (filter, sort, group). No server queries.
- **Search**: a local full-text index (MiniSearch/FlexSearch) in a Web Worker, rebuilt incrementally from document updates.
- **Attachments**: stored content-addressed (SHA-256) in OPFS/IndexedDB, queued for upload, and referenced by hash in documents.
- **Auth while offline**: a long-lived device session token cached locally. Being offline never logs you out. Permissions are checked on the server when changes sync.

## Server (one container)
- Node + **Hocuspocus** (MIT): WebSocket sync, plus an `onAuthenticate` hook (permissions per workspace and page) and `onStoreDocument` (persistence).
- **SQLite** by default (one file, easy to back up). Postgres is optional. Tables: `users`, `sessions`, `workspaces`, `documents(id, state BLOB, updated_at)`, `snapshots`, `blobs`.
- It merges updates periodically and takes snapshots for **page history**.
- Endpoints for uploading and downloading attachments, which go to disk or S3-compatible storage.
- Deploy with `docker compose up` behind Caddy or Tailscale for HTTPS.

## MVP feature list
- Nested pages, sidebar tree, drag to reorder, favourites, trash
- Blocks: paragraph, headings, bulleted/numbered/to-do lists, toggle, quote, callout, code, divider, image/file, table; slash menu; drag handles; links to other pages
- Databases: table + board views; properties: text, number, select, multi-select, date, checkbox, person, URL; filters, sorts, group-by; each row opens as a page
- Live editing with cursors and presence; status for offline, syncing and synced
- Local full-text search
- Markdown import/export; workspace backup/export
- Accounts: an admin invites users; simple workspace roles (owner/editor/viewer)

**After the MVP:** comments, page history UI, relations/rollups, calendar/gallery views, templates, Web Push, wrapping in Tauri/Capacitor.

## Biggest risks to prototype first
1. Opening the app on iOS with no network, and testing how long IndexedDB data survives on iOS/macOS.
2. Syncing 100+ documents at once over one connection, and how fast the app starts.
3. Concurrent page-tree moves and cycle repair.
4. Database views with ~5k rows computed on the client (performance on iPhone).
