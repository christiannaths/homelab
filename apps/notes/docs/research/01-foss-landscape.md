# FOSS landscape: self-hostable Notion clones (Oct 2026)

What we need: **self-hostable**, **works fully offline**, **live editing with several users**, **a lean feature set**.

## 1. Complete apps

| Project | License | Offline | Live multi-user | Stack | Notes |
| --- | --- | --- | --- | --- | --- |
| **AFFiNE** (~73k★) | README: MIT Community Edition. Vendor pages mention a separate EE license for the backend | ✅ Local-first; works offline across desktop and web | ✅ CRDT (Yjs/y-octo) | TS, BlockSuite editor, Rust bits, Node server | Closest to our goals, but large: docs, whiteboard, AI, and databases in one app. Its license story is confusing, so confirm it before forking. |
| **AppFlowy** (~77k★) | AGPL-3.0 client. Official self-host server is a commercial build | ✅ Desktop keeps a local SQLite copy | ✅ Yrs (Rust Yjs) | Flutter + Rust | The official self-host build is capped at **1 seat + 3 guests** without a license. Community AGPL builds remove the cap. The Flutter stack is hard to borrow pieces from. |
| **Colanode** (~5k★) | **Apache-2.0** | ✅ Local SQLite first, background sync | ✅ Yjs for pages and DB records | TS, Electron/web/RN, Postgres+pgvector, Redis | Architecturally the closest to what we want, and permissively licensed. Adds Slack-style chat. Web client is in "preview". One health tracker flagged it as slowing down (last commit seen Apr 2026). |
| **Docmost** (~22k★) | AGPL-3.0 core + `ee/` enterprise dirs | ❌ Not a documented feature | ✅ Yjs + Hocuspocus + Redis | TS, Tiptap, NestJS, Postgres | Polished wiki in the Confluence/Notion mould. Server-first. |
| **La Suite Docs** (~17k★, French/German gov) | MIT (some BlockNote XL features are GPL; `PUBLISH_AS_MIT=true` removes them) | ⚠️ Listed as "offline editing", no details | ✅ Yjs + Hocuspocus | Django + Next.js + BlockNote | A good reference for a lean BlockNote + Hocuspocus setup. No databases. |
| **Outline** | BSL 1.1 (not OSI) | ❌ | ✅ | React/Node | Ruled out by the license and the lack of offline support. |
| **Anytype** | any-sync is MIT. App uses a source-available license with commercial limits | ✅ Local-first, P2P | ⚠️ Not built for Notion-style live co-editing | Go + TS | Strong on privacy, weak on multiplayer. The license blocks commercial use. |
| **SiYuan / Logseq / Trilium / Joplin** | Various | ✅ | ❌ No real live co-editing | — | Single-user tools. |

## 2. Building blocks (if we build our own)

### CRDT / document sync

- **Yjs**: the de facto standard, with the most editor bindings (Tiptap, BlockNote, Lexical, ProseMirror, CodeMirror). Comes with `y-indexeddb` for offline storage and awareness/presence built in.
- **Loro**: newer, in Rust/WASM. Has history, branch/merge, and good movable-tree support for a page tree. Fewer editor bindings.
- **Automerge 3**: solid, but fewer rich-text editor integrations.

### Sync servers (self-hostable)

- **Hocuspocus** (MIT): Yjs WebSocket server with auth and persistence hooks. Used by Docmost and La Suite Docs.
- **y-sweet** (MIT): Yjs server that persists to S3/filesystem.
- For structured data (page tree, permissions, DB rows) outside Yjs: **ElectricSQL** (Apache-2.0, Postgres → client), **Zero** (Rocicorp), **PowerSync** (server is not fully FOSS), **LiveStore**, **TanStack DB**.

### Block editors

- **BlockNote** (MPL core, XL packages GPL): Notion-like out of the box, built on Tiptap, Yjs-native. The fastest way to "it feels like Notion".
- **Tiptap** (MIT core): headless and more flexible. Some pro extensions are paid.
- **BlockSuite** (MIT): AFFiNE's editor. Powerful but heavy and tied to AFFiNE's way of doing things.
- **Lexical**: Meta's editor. Small and flexible, but Notion-style blocks take more work.

## 3. Takeaways

1. **No project matches all three requirements with a clean license and a small codebase.** AFFiNE and AppFlowy come closest on features but are heavy (and AppFlowy's self-host is seat-capped). Colanode comes closest on architecture and license but includes chat and is less mature.
2. The usual stack for this is **Yjs + a Yjs-aware block editor + a Yjs sync server + IndexedDB/SQLite on the client**. Every serious OSS option except AppFlowy uses Yjs or a port of it.
3. The hard parts aren't in the editor. They are:
   - offline **auth and permissions** (what can a client do while it can't reach the server?)
   - the **page tree and metadata** (moves and renames that conflict across clients)
   - **databases** (Notion tables): per-row CRDTs vs a relational sync engine
   - **search** across documents stored as CRDT data
   - **attachments** while offline
   - **compacting** CRDT history over time

## 4. Options going forward

- **A. Fork Colanode** (Apache-2.0): remove chat and trim features. Fastest route to a working local-first app; we take on its maturity risk.
- **B. Fork AFFiNE**: richest base, but we'd spend a lot of effort removing things. Confirm the backend license first.
- **C. Build lean from parts**: BlockNote (or Tiptap) + Yjs + Hocuspocus/y-sweet + `y-indexeddb` + Postgres, in a PWA. Most control and a small surface, at the cost of more upfront work. La Suite Docs and Colanode are good code to learn from.

Open questions for the next step: which feature subset counts as MVP (databases? which views?), the target clients (PWA only, or desktop/mobile too?), and the expected number of users and level of trust (do we need E2EE?).
