# Architecture Decision Records: Notes

Decisions that are **locked in** for the Notes app (LocalNotion), based on the requirements and the evidence from three spikes (PR #1: offline sync; PR #2: page tree and databases; the access spike, [`research/07-access-spike-findings.md`](../research/07-access-spike-findings.md): Notion's access model on per-person sync). Decisions that hold for every app, such as the toolchain, are in the [platform ADRs](../../../../docs/adr/README.md), and the [`adr` skill](../../../../.agents/skills/adr/SKILL.md) sets how every ADR is written and edited.

Open questions go in **Not decided yet** below. Numbers are unique across the repo, so the gaps belong to platform ADRs or retired numbers.

| # | Decision | Depends on | Status |
|---|---|---|---|
| [1](0001-works-offline.md) | The app works fully offline | 4 | Superseded by [18](0018-works-offline-on-what-its-person-can-open.md) |
| [2](0002-yjs-stores-shared-data.md) | Yjs stores all shared data | 1 | Accepted |
| [3](0003-pwa-client.md) | The client is a PWA installed on macOS and iOS | 1 | Accepted |
| [4](0004-homelab-instance.md) | Each instance is a self-hosted homelab server for a few trusted users | none | Accepted |
| [6](0006-sqlite-server-storage.md) | The server stores document state in SQLite | 4, 5 | Accepted |
| [7](0007-crdt-rules.md) | Every feature follows five CRDT rules | 2 | Accepted |
| [8](0008-blocknote-and-mantine.md) | BlockNote is the page editor, and Mantine is the UI library | 2 | Accepted |
| [9](0009-pure-model-and-tests.md) | The data model is pure TypeScript, tested by unit and end-to-end tests | 5, 7 | Accepted |
| [10](0010-yjs-13-until-stack-supports-14.md) | Yjs stays on version 13 until the whole stack supports 14 | 2, 8, 9, 12 | Accepted |
| [11](0011-local-password-accounts.md) | Users sign in with local password accounts | 1, 4, 5, 6 | Accepted |
| [12](0012-hocuspocus-sync-server.md) | Hocuspocus is the sync server | 1, 2, 6, 11 | Superseded by [19](0019-hocuspocus-checks-every-document-and-update.md) |
| [13](0013-notion-style-access.md) | Access follows Notion's model of teamspaces and page sharing | 11 | Accepted |
| [14](0014-notion-page-access-levels.md) | Page access levels mirror Notion's | 13 | Accepted |
| [17](0017-per-page-documents-and-per-person-index.md) | Each page is its own Yjs document, found through a per-person index the server writes | 2, 7, 11, 13, 14, 18 | Accepted |
| [18](0018-works-offline-on-what-its-person-can-open.md) | The app works fully offline with everything its person can open | 4, 11, 13 | Accepted |
| [19](0019-hocuspocus-checks-every-document-and-update.md) | Hocuspocus is the sync server, and it checks access on every document and update | 2, 6, 11, 13, 14, 17, 18 | Accepted |
| [20](0020-hono-http-and-better-auth-accounts.md) | Hono serves HTTP, and Better Auth manages accounts and sessions | 3, 4, 5, 6, 11, 13, 19 | Accepted |

## Not decided yet

These are deliberately **not** locked in for Notes, and the current implementation is replaceable. Each item lists what would settle it and who does the work: **human** means testing on real devices, or a product decision; **AI** means work that can be automated or built in the sandbox.

| Topic | Where it stands | What would settle it | Who |
|---|---|---|---|
| **Public read-only publishing of pages and subpages** | Not built. Access is settled ([ADR 13](0013-notion-style-access.md), [ADR 14](0014-notion-page-access-levels.md)), and devices only receive what their person can open ([ADR 17](0017-per-page-documents-and-per-person-index.md)) | A product decision on what a published page shows, then a design for serving it to people with no account | Human (decision), then AI |
| **Access details Notion doesn't document** | The access spike chose: Can edit may move a page only where nobody's access changes; Can edit content may trash rows, and a database's own body counts as structure; a guest's new subpage inherits its parent's level; a guest with Full access may set general access; workspace owners may only toggle a teamspace's default flag in teamspaces they are not in ([`research/07-access-spike-findings.md`](../research/07-access-spike-findings.md)) | A product decision on each, checked against Notion where its help centre can be read | Human (decision), then AI |
| **Select, multi-value and relation properties, very large databases, and blocks shared between pages** | Each row is its own document so it can be shared alone ([ADR 17](0017-per-page-documents-and-per-person-index.md)). A select's option names would reach anyone given one row, so the spike left selects out. A 2,000-row database is 2,002 documents | A design for where option names and references live under single-row sharing, and a measurement of very large databases | AI, then human review |
| **The PWA works offline on Apple devices** (would reopen [ADR 3](0003-pwa-client.md)) | Loads in Safari on an iPhone. An installed offline start and how long Safari keeps data are unconfirmed | Install on the iPhone and the Mac → Airplane Mode → force-quit → reopen. Then leave it **unopened for 7+ days** and check the data is still there (Diagnostics: persistence flag, storage used) | Human |
| **Device storage** | `y-indexeddb`, one IndexedDB database per doc. The cost per document, here and in Hocuspocus, is what drives startup ([`research/07-access-spike-findings.md`](../research/07-access-spike-findings.md)) | Build one shared IndexedDB store and an OPFS SQLite store behind the same interface, with a Diagnostics benchmark. Measure in Chromium, then on an iPhone | AI builds and measures in Chromium; human runs on iPhone |
| **Keeping every doc in memory** | 2,000 pages used about 307 MB of JS heap in Chromium in the first gate test. With per-person sync, a workspace owner's 1,973 documents use about 176 MB, a member's 1,252 about 103 MB ([`research/07-access-spike-findings.md`](../research/07-access-spike-findings.md)), still in desktop Chromium, which has far more memory than an iPhone | Run Diagnostics → 4 × "Create 500 test pages" on an iPhone. Report startup time, and whether iOS reloads or closes the app | Human runs; AI designs on-demand loading if it fails |
| **Phone layout and touch interactions** | The sidebar sits above the content; long-press to drag | PR #2's iPhone checklist (section 8): touch drag and drop, scrolling a large table, the native pickers. Then an AI design pass on the phone layout | Human, then AI |
| **Comments, more database views, attachments, search, page history** | Not built. Until comments exist, Can comment behaves like Can view ([ADR 14](0014-notion-page-access-levels.md)) | A design spike for each | AI |
| **Wrapping as a native app** (Tauri, Capacitor) | Not used | Only if the Apple-device checks above fail | Depends on the Apple-device row |
