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

## Not decided yet

These were used in the spikes but are **deliberately not locked in**. Each one has a known problem or hasn't been tested enough. Treat the current implementation as replaceable.

| Topic | What the spikes used | Why it's still open | What would settle it |
|---|---|---|---|
| Sync server and protocol | Hocuspocus 4, one WebSocket carrying every doc | It authenticates each document separately, and its default limits disconnected workspaces with more than 100 docs (raised as a workaround) | Authenticate once per connection: try it in Hocuspocus, or compare with a small custom Yjs sync server |
| Device storage | `y-indexeddb`, one IndexedDB database per doc | The main startup bottleneck: opening hundreds of databases is slower than syncing over a LAN | Benchmark one shared IndexedDB store against OPFS SQLite on an iPhone |
| Docs held in memory | Every doc open at once | Fine for hundreds of docs; unknown for thousands, especially on iOS | Memory and startup measurements on an iPhone with 1,000+ pages |
| Yjs 14 | Yjs 13 (BlockNote already supports both) | Hocuspocus and y-indexeddb are still on 13 | Ecosystem support, plus a migration test on real data |
| Accounts and permissions | A random name per device, plus an optional shared token | Not designed yet; offline-first changes how permissions can be enforced | A design for accounts, roles, sharing and how revoked access behaves offline |
| Phone layout and touch interactions | The sidebar sits above the content; long-press to drag | The iPhone checks for PR #2 haven't been run yet | Results of PR #2's iPhone checklist |
| Database views beyond the table | Table only; sort plus a quick filter | Board view, saved filters, relations and changing a property's type haven't been built | A spike on the board view and filters |
| Attachments, search, page history | Not built | Each has open design questions (offline uploads, storage format, history compaction) | Spikes for each |
| Wrapping as a native app (Tauri, Capacitor) | Not used | Only needed if the PWA hits a limit | A concrete limit found in real use |
