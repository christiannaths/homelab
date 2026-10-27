# Architecture Decision Records: Notes

Settled decisions for Notes (LocalNotion), from the requirements and three spikes: PR #1 (offline sync), PR #2 (page tree, databases), the access spike ([`research/07-access-spike-findings.md`](../research/07-access-spike-findings.md)). Cross-app decisions: [platform ADRs](../../../../docs/adr/README.md). Writing ADRs: the [`adr` skill](../../../../.agents/skills/adr/SKILL.md). Namespace `NOTE`.

| ID | Problem | Decision | Status |
| --- | --- | --- | --- |
| [ADR-NOTE-001](ADR-NOTE-001-offline-use.md) | How does the app keep working without a network? | Fully offline, with everything its person can open | Accepted |
| [ADR-NOTE-002](ADR-NOTE-002-merging-edits.md) | How do edits from several devices come together? | Yjs stores all shared data | Accepted |
| [ADR-NOTE-003](ADR-NOTE-003-app-delivery.md) | How does the app reach people's Macs and iPhones? | A PWA | Accepted |
| [ADR-NOTE-004](ADR-NOTE-004-hosting-and-scale.md) | How is the app hosted, and for how many people? | One self-hosted server, a few trusted users | Accepted |
| [ADR-NOTE-005](ADR-NOTE-005-document-persistence.md) | How does the server keep documents safe across restarts? | SQLite | Accepted |
| [ADR-NOTE-006](ADR-NOTE-006-merge-safety.md) | How do features avoid conflicts and lost edits when changes merge? | Five CRDT rules | Accepted |
| [ADR-NOTE-007](ADR-NOTE-007-page-editing-and-ui.md) | How do people edit pages, and how is the interface built? | BlockNote, Mantine | Accepted |
| [ADR-NOTE-008](ADR-NOTE-008-model-correctness.md) | How is the data model kept correct? | Pure TypeScript, unit and e2e tested | Accepted |
| [ADR-NOTE-009](ADR-NOTE-009-identity.md) | How does an instance know who is editing? | Gateway sign-in and headers | Accepted |
| [ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md) | How do changes reach other devices, and how is access enforced on them? | Hocuspocus, checking every document and update | Accepted |
| [ADR-NOTE-011](ADR-NOTE-011-access-control.md) | How does an instance control who can see and change each page? | Notion's teamspaces and sharing | Accepted |
| [ADR-NOTE-012](ADR-NOTE-012-page-permissions.md) | How finely can access to a page be granted? | Notion's access levels | Accepted |
| [ADR-NOTE-013](ADR-NOTE-013-data-layout.md) | How is data laid out so each person receives only what they can open? | A document per page, plus a per-person index | Accepted |
| [ADR-NOTE-014](ADR-NOTE-014-http-and-accounts.md) | How does the server handle HTTP requests and account security? | Hono; person from gateway headers | Accepted |

## Not decided yet

Replaceable for now. **Human** = real devices or a product decision; **AI** = sandbox work.

| Topic | Where it stands | What would settle it | Who |
| --- | --- | --- | --- |
| **Public read-only publishing** | Not built | Decide what a published page shows; design serving it without an account | Human, then AI |
| **Access details Notion doesn't document** | Spike's choices ([`research/07-access-spike-findings.md`](../research/07-access-spike-findings.md)): Can edit moves a page only where nobody's access changes; Can edit content may trash rows, and a database's body is structure; a guest's new subpage inherits its parent's level; a Full-access guest may set general access; workspace owners only toggle the default flag in teamspaces they're not in | Decide each, checking Notion where possible | Human, then AI |
| **Select, multi-value and relation properties; very large databases; shared blocks** | Select options would reach anyone given one row ([ADR-NOTE-013](ADR-NOTE-013-data-layout.md)), so left out. 2,000 rows = 2,002 documents | Design where option names and references live; measure | AI, then human review |
| **PWA offline on Apple devices** (would reopen [ADR-NOTE-003](ADR-NOTE-003-app-delivery.md)) | Loads in iPhone Safari; installed offline start and data retention unconfirmed | iPhone and Mac: install → Airplane Mode → force-quit → reopen; leave **unopened 7+ days**, check data (Diagnostics: persistence flag, storage used) | Human |
| **Device storage** | `y-indexeddb`, one database per doc; per-document cost drives startup | Shared IndexedDB store and OPFS SQLite store behind one interface, benchmarked in Diagnostics; Chromium, then iPhone | AI in Chromium; human on iPhone |
| **Every doc in memory** | Desktop Chromium heap: 2,000 pages ≈ 307 MB; per-person, owner's 1,973 docs ≈ 176 MB, member's 1,252 ≈ 103 MB. iPhones have far less | iPhone: Diagnostics → 4 × "Create 500 test pages"; report startup and whether iOS reloads or kills the app | Human; AI designs on-demand loading if it fails |
| **Phone layout and touch** | Sidebar above content; long-press to drag | PR #2's iPhone checklist (section 8), then an AI layout pass | Human, then AI |
| **Comments, views, attachments, search, history** | Not built; Can comment = Can view ([ADR-NOTE-012](ADR-NOTE-012-page-permissions.md)) | A design spike each | AI |
| **Native wrapper** (Tauri, Capacitor) | Not used | Only if the Apple-device checks fail | Per that row |
