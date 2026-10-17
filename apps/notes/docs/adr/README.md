# Architecture Decision Records: Notes

Decisions that are **locked in** for the Notes app (LocalNotion), based on the requirements and the evidence from the first two spikes (PR #1: offline sync; PR #2: page tree and databases). Decisions that hold for every app, such as the toolchain, are in the [platform ADRs](../../../../docs/adr/README.md), which also set the format and style every ADR follows.

An ADR is written only once a decision is settled. Open questions go in **Not decided yet** below. An accepted ADR is not edited to change its decision: a new ADR supersedes it. Numbers are unique across the repo, so the gaps belong to platform ADRs.

| # | Decision | Depends on | Status |
|---|---|---|---|
| [1](0001-works-offline.md) | The app works fully offline | 4 | Accepted |
| [2](0002-yjs-stores-shared-data.md) | Yjs stores all shared data | 1 | Accepted |
| [3](0003-pwa-client.md) | The client is a PWA installed on macOS and iOS | 1 | Accepted |
| [4](0004-homelab-instance.md) | Each instance is a self-hosted homelab server for a few trusted users | none | Accepted |
| [6](0006-sqlite-server-storage.md) | The server stores document state in SQLite | 4, 5 | Accepted |
| [7](0007-crdt-rules.md) | Every feature follows five CRDT rules | 2 | Accepted |
| [8](0008-blocknote-and-mantine.md) | BlockNote is the page editor, and Mantine is the UI library | 2 | Accepted |
| [9](0009-pure-model-and-tests.md) | The data model is pure TypeScript, tested by unit and end-to-end tests | 5, 7 | Accepted |
| [10](0010-yjs-13-until-stack-supports-14.md) | Yjs stays on version 13 until the whole stack supports 14 | 2, 8, 9, 12 | Accepted |
| [11](0011-local-password-accounts.md) | Users sign in with local password accounts | 1, 4, 5, 6 | Accepted |
| [12](0012-hocuspocus-sync-server.md) | Hocuspocus is the sync server | 1, 2, 6, 11 | Accepted |
| [13](0013-notion-style-access.md) | Access follows Notion's model of teamspaces and page sharing | 1, 11, 12 | Proposed |
| [14](0014-notion-page-access-levels.md) | Page access levels mirror Notion's | 12, 13 | Proposed |
| [20](0020-hono-http-and-better-auth-accounts.md) | Hono serves HTTP, and Better Auth manages accounts and sessions | 3, 4, 5, 6, 11, 12, 13 | Accepted |

## Not decided yet

These are deliberately **not** locked in for Notes, and the current implementation is replaceable. Each item lists what would settle it and who does the work: **human** means testing on real devices, or a product decision; **AI** means work that can be automated or built in the sandbox.

| Topic | Where it stands | What would settle it | Who |
|---|---|---|---|
| **Access control:** who can see and edit which pages (private pages, sharing with guests, read-only roles) | Every account can see and edit everything. Proposed in [ADR 13](0013-notion-style-access.md) (Notion's model) and [ADR 14](0014-notion-page-access-levels.md) (access levels); specs in [`../specs/access/`](../specs/access/README.md) | A feasibility design for per-person sync under [ADR 1](0001-works-offline.md), including the document split | AI, then human review |
| **Public read-only publishing of pages and subpages** | Not built | Settled after access control | Human (decision), then AI |
| **How data is split across Yjs documents** | The prototype uses one workspace doc for the page tree, one doc per page body, and one doc per database holding every row | The final feature list. Access control, sharing individual rows, very large databases, multi-value properties (tags, people, relations) and blocks shared between pages each depend on this split | Human (feature list), then AI |
| **The PWA works offline on Apple devices** (would reopen [ADR 3](0003-pwa-client.md)) | Loads in Safari on an iPhone. An installed offline start and how long Safari keeps data are unconfirmed | Install on the iPhone and the Mac → Airplane Mode → force-quit → reopen. Then leave it **unopened for 7+ days** and check the data is still there (Diagnostics: persistence flag, storage used) | Human |
| **Device storage** | `y-indexeddb`, one IndexedDB database per doc; this is the startup bottleneck | Build one shared IndexedDB store and an OPFS SQLite store behind the same interface, with a Diagnostics benchmark. Measure in Chromium, then on an iPhone | AI builds and measures in Chromium; human runs on iPhone |
| **Keeping every doc in memory** | 2,000 pages use about 307 MB of JS heap in Chromium ([ADR 12](0012-hocuspocus-sync-server.md) gate test) | Run Diagnostics → 4 × "Create 500 test pages" on an iPhone. Report startup time, and whether iOS reloads or closes the app | Human runs; AI designs on-demand loading if it fails |
| **Phone layout and touch interactions** | The sidebar sits above the content; long-press to drag | PR #2's iPhone checklist (section 8): touch drag and drop, scrolling a large table, the native pickers. Then an AI design pass on the phone layout | Human, then AI |
| **More database views, attachments, search, page history** | Not built | A design spike for each | AI |
| **Wrapping as a native app** (Tauri, Capacitor) | Not used | Only if the Apple-device checks above fail | Depends on the Apple-device row |
