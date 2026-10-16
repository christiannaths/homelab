# Architecture Decision Records

Decisions we've **locked in** for LocalNotion, based on the requirements and the evidence from the first two spikes (PR #1: offline sync; PR #2: page tree and databases). How these records work is described in [ADR 1](0001-record-architecture-decisions.md).

| # | Decision | Status |
|---|---|---|
| [1](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [2](0002-local-first-device-is-source-of-truth.md) | Local-first: the device holds the real data, the server is a relay and backup | Accepted |
| [3](0003-yjs-for-all-shared-data.md) | Yjs is the CRDT for all shared data | Accepted |
| [4](0004-pwa-for-ios-and-macos.md) | The client is a PWA, installed on macOS and iOS | Accepted |
| [5](0005-self-hosted-homelab-deployment.md) | Self-hosted homelab deployment for a handful of trusted users | Accepted |
| [6](0006-typescript-on-node-26.md) | TypeScript everywhere, on Node.js 26, in one npm-workspaces repo | Accepted |
| [7](0007-sqlite-server-storage.md) | The server stores Yjs document state in SQLite | Accepted |
| [8](0008-document-granularity.md) | How data is split across Yjs documents | Accepted |
| [9](0009-crdt-invariants.md) | CRDT rules every feature must follow | Accepted |
| [10](0010-blocknote-editor.md) | BlockNote is the page editor, using only its MPL-licensed packages | Accepted |
| [11](0011-pure-model-and-testing.md) | A pure data-model layer, tested at two levels | Accepted |
| [12](0012-stay-on-yjs-13.md) | Stay on Yjs 13 until the stack supports Yjs 14 | Accepted |
| [13](0013-workspace-is-the-unit-of-access.md) | The workspace is the unit of access | Accepted |
| [14](0014-local-password-accounts.md) | Local accounts with passwords | Accepted |
| [15](0015-public-read-only-publishing.md) | Public, read-only publishing of pages and subpages | Accepted |
| [16](0016-hocuspocus-sync-server.md) | Keep Hocuspocus as the sync server | Accepted |

## Not decided yet

These are deliberately **not** locked in. The current implementation is replaceable. Each item lists what would settle it and who does the work: **human** means testing on real devices, or a product decision; **AI** means work that can be automated or built in the sandbox.

| Topic | Where it stands | What would settle it | Who |
|---|---|---|---|
| **The PWA works offline on Apple devices** (would reopen ADR 4) | Loads in Safari on an iPhone. An installed offline start and how long Safari keeps data are unconfirmed | Install on the iPhone and the Mac → Airplane Mode → force-quit → reopen. Then leave it **unopened for 7+ days** and check the data is still there (Diagnostics: persistence flag, storage used) | Human |
| **Device storage** | `y-indexeddb`, one IndexedDB database per doc; this is the startup bottleneck | Build one shared IndexedDB store and an OPFS SQLite store behind the same interface, with a Diagnostics benchmark. Measure in Chromium, then on an iPhone | AI builds and measures in Chromium; human runs on iPhone |
| **Keeping every doc in memory** | 2,000 pages use ~307 MB of JS heap in Chromium (ADR 16 test) | Run Diagnostics → 4 × "Create 500 test pages" on an iPhone. Report startup time, and whether iOS reloads or kills the app | Human runs; AI adds an on-demand loading design if it fails |
| **Phone layout and touch interactions** | The sidebar sits above the content; long-press to drag | PR #2's iPhone checklist (section 7): touch drag-and-drop, scrolling a large table, the native pickers. Then an AI design pass on the phone layout | Human, then AI |
| **Roles within a workspace** (e.g. read-only members) | Every member can edit | A product decision: do some members need read-only access? | Human (decision) |
| **More database views, attachments, search, page history** | Not built | A design spike for each | AI |
| **Wrapping as a native app** (Tauri, Capacitor) | Not used | Only if the Apple-device checks above fail | Depends on the first row |
