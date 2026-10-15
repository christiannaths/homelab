# Spike 1 findings: offline PWA + whole-workspace sync

**Goal:** check the two risks from the architecture doc that decide whether a PWA-only approach works:
1. Does the app open with no network, and do offline edits survive and merge?
2. How fast are startup and sync with 100+ documents on one connection?

**Stack used:**
- Client: React 19 + Vite 8 + vite-plugin-pwa (Workbox), BlockNote 0.56 (`@blocknote/core/yjs`), Yjs 13.6, y-indexeddb, `@hocuspocus/provider` 4.7
- Server: Hocuspocus 4.7 + `node:sqlite` (no native dependencies)

## Results (headless Chromium on Linux, server on localhost)

| Scenario | Result |
|---|---|
| Two users editing live, with cursors | ✅ |
| Device offline → app closed → reopened | ✅ Boots from the service worker; content comes from IndexedDB |
| Offline edits + concurrent online edits to the same paragraph | ✅ Merge on reconnect, with both edits kept (`"Bob: Packed passport. Bought adapters offline."`) |
| Page created offline | ✅ Appears for other users after reconnecting |
| Server down → app reopened → edits → server back up | ✅ Edits sync; data survives server restarts (SQLite) |

Docs in the scale tests are ~30-paragraph pages:

| | 101 docs | 201 docs | 501 docs |
|---|---|---|---|
| New device: all docs downloaded | ~0.5 s | ~0.8 s | ~1.3 s |
| Warm start offline: all docs loaded from IndexedDB | ~0.45 s | ~0.7 s | ~1.1 s |
| Warm start online: all docs loaded locally | ~0.6 s | ~1.2 s | ~1.7 s |

The workspace and the current page appear long before *all* docs finish loading, because the UI waits only for the docs it shows.

## Problems found

1. **Hocuspocus disconnects a client syncing more than 100 docs on one socket.** It authenticates each document separately. Its anti-abuse defaults (`maxPendingDocuments: 100`, 5 MB queued before auth) close the connection, and the client reconnects in a loop. **Fixed** for now by raising the limits on the server, and the scale test now covers 201 docs.
   - Long-term: authenticate once per connection (one token check, then trust that socket's docs), or sync docs in priority tiers (workspace + open pages first, the rest in throttled batches).
2. **IndexedDB is the startup bottleneck, not the network.** y-indexeddb creates **one IndexedDB database per document**, and opening hundreds of databases is slower than downloading them over a LAN. Fix candidates:
   - one IndexedDB database (or an OPFS SQLite file) holding all docs
   - loading local docs in priority order
3. **Every doc is kept in memory.** Fine for hundreds of pages. At thousands, sleeping docs should be unloaded and woken by a lightweight server "doc changed" notification.
4. **Yjs 13 → 14 transition.** BlockNote already ships entry points for both Yjs 13 (`@blocknote/core/yjs`) and the Yjs 14 RC (`@blocknote/core/y`). Hocuspocus 4 and y-indexeddb are still on 13. Stay on 13 for now and keep the Yjs dependency behind `SyncManager`.
5. **Inline cursor labels end up in the editor's DOM text.** Irrelevant to users, but tests (and later anything that scrapes the DOM) must ignore them.

## Not verified yet (needs real Apple devices)
This sandbox has no WebKit, so **Safari, iOS and macOS "Add to Dock" are untested.** Checklist to run on a device (served over HTTPS):
- [ ] macOS Safari: *File → Add to Dock*. Does the app open in its own window? Does Diagnostics show "Installed (standalone): true"?
- [ ] iOS: *Add to Home Screen*. Open it once online, then in **airplane mode** force-quit and reopen. Does the content load?
- [ ] Edit in airplane mode, reconnect, and confirm the edit appears on the other device.
- [ ] Diagnostics → "Create 500 test pages", then reload: record the "all docs loaded locally" time on an iPhone.
- [ ] After a week of not opening the app, is the data still there? Check the persistent-storage flag and the usage figure.

## Next steps (proposed)
1. Run the device checklist above.
2. Replace y-indexeddb with a single-database store, and authenticate once per connection.
3. Spike 2: the page tree (nesting, moves, cycle repair) and a first database view (table), using the data model in `03-architecture.md`.
