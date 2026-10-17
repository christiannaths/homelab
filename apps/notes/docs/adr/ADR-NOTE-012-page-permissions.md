# ADR-NOTE-012. How finely can access to a page be granted?

- Status: Accepted
- Date: 2026-10-17
- Depends on: [ADR-NOTE-011](ADR-NOTE-011-access-control.md)
- Dependency of: [ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md), [ADR-NOTE-013](ADR-NOTE-013-data-layout.md)

## Context
The access model ([ADR-NOTE-011](ADR-NOTE-011-access-control.md)) decides who can open a page. Some people should only read or comment on what they can open: a babysitter's house manual, an accountant's yearly summary. Notion's access levels are familiar to the intended users, so copying them avoids teaching a new permission model.

## Decision
- **Every grant of access carries one of Notion's levels:**
  - **Full access:** read, comment, edit, and share.
  - **Can edit:** read, comment and edit, but not share.
  - **Can edit content** (databases only): add, edit and trash rows and their values and bodies, but not change the database page, its properties, views, sorts or filters.
  - **Can comment:** read and comment.
  - **Can view:** read.
  - **No access:** used to restrict an inherited level.
- **Only Full access can share** or change other people's access. A move that changes anyone's level on a page is a change of access, so it needs Full access on that page.
- **The most permissive level wins** when a person has access from more than one source. A per-person No access only replaces that person's own entry: it does not beat general access or teamspace access, and a Private section's owner and a teamspace's owners always keep Full access.
- **The UI does not offer actions a level does not allow, and the server rejects edits from people below Can edit when their device syncs.** A device whose edit is rejected discards its copy of the page and syncs it again.
- Until comments exist, Can comment behaves like Can view.

## Evidence
- The access spike ([`research/07-access-spike-findings.md`](../research/07-access-spike-findings.md)), in `spikes/notes-access-sync-poc/`:
  - `model/src/access.test.ts` and `model/src/overrides.test.ts`: each level as invited, expand, restrict, Restore inherited access, and most permissive wins across sources, including No access against general access.
  - `server/testing/rejecting-edits.test.ts` and `e2e/tests/rejecting-edits.spec.ts`: Can view and Can comment open read-only online and offline, a forged edit is refused and the device recovers, and access changes and access-changing moves are refused below Full access.
  - `server/testing/databases.test.ts` and `model/src/database.test.ts`: Can edit content adds rows and edits values, and is refused on views and properties.
  - `server/testing/teamspaces.test.ts`: teamspace owners keep Full access whatever the members' level and page overrides say.
- The levels follow Notion's help centre ("Sharing & permissions"). Notion does not document who may move a shared page, so the move rule is the spike's choice.

## Consequences
- The sync server checks, for each document and each update, whether the person may make that change, and rejects it otherwise ([ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md)).
- Can edit content means checking which parts of a database an update changes. The split puts structure and rows in different documents to make that check simple ([ADR-NOTE-013](ADR-NOTE-013-data-layout.md)).
- Read-only copies still work offline. Only editing is unavailable.
