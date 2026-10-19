# Architecture Decision Records: Encyclopedia

Decisions that are **locked in** for the Encyclopedia app, a read-only copy of Wikipedia that comes already populated. They rest on the research in [`../research/`](../research/) and on product decisions made with Christian on 2026-10-18. Decisions that hold for every app are in the [platform ADRs](../../../../docs/adr/README.md), and the [`adr` skill](../../../../.agents/skills/adr/SKILL.md) sets how every ADR is written and edited.

An ADR is written only once a decision is settled. Open questions go in **Not decided yet** below. Encyclopedia ADRs use the `ENCY` namespace.

| ID | Problem | Decision | Status |
| --- | --- | --- | --- |
| [ADR-ENCY-001](ADR-ENCY-001-content-source.md) | How does an install get Wikipedia's content? | The app downloads and updates one Kiwix Wikipedia ZIM file, picked by the admin, starting from a small starter file | Accepted |
| [ADR-ENCY-002](ADR-ENCY-002-article-serving.md) | How are articles and search served to readers? | The app's own Node server reads the ZIM file with libzim; kiwix-serve is not used | Accepted |
| [ADR-ENCY-003](ADR-ENCY-003-licensing.md) | How does the app meet the licences of the code and content it uses? | The app is GPLv3, keeps each article's attribution footer, and is never named "Wikipedia" | Accepted |
| [ADR-ENCY-004](ADR-ENCY-004-identity.md) | How does the app know who is reading? | People sign in with their homelab account; only the homelab admin changes the content | Accepted |
| [ADR-ENCY-005](ADR-ENCY-005-offline-use.md) | How does the app keep working without a network? | Devices keep saved articles and recently read ones; offline search covers only those | Accepted |
| [ADR-ENCY-006](ADR-ENCY-006-article-presentation.md) | How do articles look inside the homelab? | The app wears the homelab's look; articles keep Wikipedia's layout, restyled | Accepted |

## Not decided yet

These are deliberately **not** locked in. **Human** means a product decision or testing on real devices; **AI** means work that can be automated or built in the sandbox.

| Topic | Where it stands | What would settle it | Who |
| --- | --- | --- | --- |
| **Current file sizes and the update schedule** | Taken from secondary sources; Kiwix's hosts were unreachable from the research environment ([`research/02-zim-and-libzim.md`](../research/02-zim-and-libzim.md)) | Reading Kiwix's catalog and download listings directly | AI |
| **libzim on the server's base image** | Untested | Installing `@openzim/libzim` in the chosen image, on amd64 and arm64 | AI |
| **Wikimedia pages read only through excerpts** | Trademark policy, Terms of Use, reuse guidance and the GPL FAQ ([`research/03-licensing.md`](../research/03-licensing.md)) | Reading each page on the live site | AI, then human review |
| **Several languages per install** | One language per install ([ADR-ENCY-001](ADR-ENCY-001-content-source.md)) | A product decision when someone needs it | Human |
| **Sharing saved lists** | Lists are private to their owner | A product decision when someone needs it | Human |
| **Offline search across every title** | Skipped for now ([ADR-ENCY-005](ADR-ENCY-005-offline-use.md)) | Evidence that people search offline for articles they have not saved | Human |
| **The PWA works offline on Apple devices** | Unconfirmed, as for Notes | Install on an iPhone, go offline, reopen, and check data survives a week unopened | Human |
