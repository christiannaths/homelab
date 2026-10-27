# Architecture Decision Records: Encyclopedia

Decisions **locked in** for the Encyclopedia app, a read-only, already-populated copy of Wikipedia. They rest on [`../research/`](../research/) and product decisions made with Christian on 2026-10-18.

- Decisions for every app: [platform ADRs](../../../../docs/adr/README.md). How ADRs are written and edited: the [`adr` skill](../../../../.agents/skills/adr/SKILL.md).
- ADRs only for settled decisions; open questions go in **Not decided yet** below. Namespace: `ENCY`.

| ID | Problem | Decision | Status |
| --- | --- | --- | --- |
| [ADR-ENCY-001](ADR-ENCY-001-content-source.md) | How does an install get Wikipedia's content? | App downloads and updates one admin-picked Kiwix ZIM, starting from a starter file | Accepted |
| [ADR-ENCY-002](ADR-ENCY-002-article-serving.md) | How are articles and search served to readers? | Own Node server reads the ZIM with libzim; no kiwix-serve | Accepted |
| [ADR-ENCY-003](ADR-ENCY-003-licensing.md) | How does the app meet the licences of the code and content it uses? | GPLv3, keeps attribution footers, never named "Wikipedia" | Accepted |
| [ADR-ENCY-004](ADR-ENCY-004-identity.md) | How does the app know who is reading? | Homelab account, keyed by account id; admin-level App access changes content | Accepted |
| [ADR-ENCY-005](ADR-ENCY-005-offline-use.md) | How does the app keep working without a network? | Devices keep saved and recent articles; offline search covers only those | Accepted |
| [ADR-ENCY-006](ADR-ENCY-006-article-presentation.md) | How do articles look inside the homelab? | Homelab look; articles keep Wikipedia's layout, restyled | Accepted |

## Not decided yet

Deliberately **not** locked in. **Human**: a product decision or testing on real devices. **AI**: work that can be automated or built in the sandbox.

| Topic | Where it stands | What would settle it | Who |
| --- | --- | --- | --- |
| **Current file sizes and the update schedule** | Secondary sources; Kiwix unreachable from research ([`research/02-zim-and-libzim.md`](../research/02-zim-and-libzim.md)) | Reading Kiwix's catalog and listings directly | AI |
| **libzim on the server's base image** | Untested | Install `@openzim/libzim` in the chosen image, amd64 and arm64 | AI |
| **Wikimedia pages read only through excerpts** | Trademark policy, Terms of Use, reuse guidance, GPL FAQ ([`research/03-licensing.md`](../research/03-licensing.md)) | Read each live page | AI, then human review |
| **Several languages per install** | One language per install ([ADR-ENCY-001](ADR-ENCY-001-content-source.md)) | Product decision when needed | Human |
| **Sharing saved lists** | Private to their owner | Product decision when needed | Human |
| **Offline search across every title** | Skipped for now ([ADR-ENCY-005](ADR-ENCY-005-offline-use.md)) | Evidence people search offline for unsaved articles | Human |
| **The PWA works offline on Apple devices** | Unconfirmed, as for Notes | iPhone: install, go offline, reopen; data survives a week unopened | Human |
