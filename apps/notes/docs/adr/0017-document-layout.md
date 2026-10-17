# 17. How are pages split into documents, and how does a device find its own?

- Status: Accepted
- Date: 2026-10-17
- Depends on: [ADR 1](0001-offline-use.md), [ADR 2](0002-shared-data-model.md), [ADR 7](0007-merge-rules.md), [ADR 11](0011-sign-in.md), [ADR 13](0013-access-model.md), [ADR 14](0014-page-access-levels.md)
- Dependency of: [ADR 12](0012-sync-server.md)

## Context
A Yjs document reaches a device whole or not at all, and a device may only receive what its person can open ([ADR 13](0013-access-model.md), [ADR 1](0001-offline-use.md)). The first two spikes kept the whole page tree, every page's title and parent, in one workspace document, and every row of a database in the database's document. Either would carry titles and values to people who must not see them, because any page can be shared on its own or restricted to No access, including a single database row ([ADR 14](0014-page-access-levels.md)). Access data has the same problem: a private teamspace's name, or who a page is shared with, must only reach the people allowed to see it. All shared data is Yjs ([ADR 2](0002-shared-data-model.md)), and every structure must merge under the CRDT rules ([ADR 7](0007-merge-rules.md)).

## Decision
- **A document is the unit of access.** Each document holds only data that goes to exactly the same people, and nothing is copied into several documents.
- **`page:<id>`: one document per page**, holding:
  - `meta`, one key per field: `title`, `kind` (page, database or row), `parentId`, `section`, `order`, `createdAt` and `deletedAt`;
  - `access`: the access set on this page, one key per entry (`person:<id>`, `workspace` for general access, `teamspace` for an override of the teamspace members' level). An absent key inherits from the parent;
  - `content`: the page body.
- **There is no workspace-wide document.** Each device builds its person's page tree from the page documents it received, with the existing derived tree ([ADR 7](0007-merge-rules.md) rule 1): a parent the device never received counts as missing, so the page is top level and goes in the Shared section. A subpage's section is its top-level ancestor's, and a move writes only the moved page's `parentId`, `section` and `order`, in one transaction.
- **`index:<personId>`: one document per person, written only by the server.** It maps the ids of the pages and teamspaces the person can open to their level, with no titles. Devices follow it to find which documents to open, and read their own level from it to decide what to offer. Devices never work out their own level, because it depends on ancestors they may not hold. The server opens a person's index read-only for them and for nobody else.
- **`teamspace:<id>`: one document per teamspace**, with its settings (name, kind, default flag, members' level, non-member level) and its members, one key each. It reaches every member of the workspace for open and closed teamspaces, and only its members and the workspace owners for private ones. Guests never receive it.
- **A database is split by who may receive each part:**
  - its page (`kind` database) holds its title, access, body and **views**;
  - `schema:<id>` holds its **properties**, and reaches everyone who can open the database or any of its rows (Can view for the latter);
  - each **row is a page** (`kind` row, `parentId` = the database) holding its title, order, **cells** (one key per property) and body. A row inherits the database's access like any subpage, and can be shared on its own.
- **People and their workspace roles are account data**, stored with the accounts on the server ([ADR 11](0011-sign-in.md)) and read by devices from it. Clients never edit them offline, so they are not shared Yjs data.
- **Ids are random UUIDs** and may reach devices as references inside documents the person can open: a hidden parent's id as a page's `parentId` (a row's database id the same way), and, for a guest, a teamspace's id as a page's `section`. Titles, names and content of what the person cannot open never do.
- **A page id the server has never seen** can be opened by any member, and by a guest, so it can be created there. The server reviews the first update where it places the page ([ADR 12](0012-sync-server.md)). This is safe only because ids are random UUIDs.
- **Rejected:**
  - **A filtered tree document per person, written by the server** from a canonical tree. Clients would edit their projection, so the server would translate every write back and fan it out, becoming a merge point. Offline moves would conflict with the server's re-projection, so the server would write repairs (against [ADR 7](0007-merge-rules.md) rule 1). Every title would be stored once per person.
  - **One tree document per Private section or teamspace.** A subpage restricted to No access, or shared on its own, would still have its title in the container's document.
  - **A separate `meta:<id>` document beside each page.** It doubles the documents, both must always carry the same access, and "meta without content" becomes a state to handle. It was kept as the fallback in case startup was slow, which it was not.
  - **One workspace document, hidden in the UI.** Titles would reach every device.
  - **Access in an `access:<id>` document** (doubles the documents), **in SQLite with an HTTP API** (no offline sharing and no merge, against [ADR 2](0002-shared-data-model.md)), or **in the per-person index** (every sharer's change fanned out by the server, and the Share menu needs other people's entries).
  - **Every row's cells in the database document**, as in the first spikes (a row shared alone would carry every other row's values), **a copy of the properties in every row** (fanned out on each property change), and **the properties inside the database page** (it would carry the views and the title to people given one row).

## Evidence
- The access spike ([`research/07-access-spike-findings.md`](../research/07-access-spike-findings.md), risk 1), in `spikes/notes-access-sync-poc/`:
  - `server/testing/sync-boundary.test.ts`: Private pages never reach anyone else's device, by document or by title in anything received; a person's index is read-only and refused to everyone else.
  - `server/testing/overrides.test.ts`: a page reachable without its parent arrives at the top of Shared with no document or title of the hidden parent.
  - `server/testing/teamspaces.test.ts`, `server/testing/guests.test.ts` and `server/testing/databases.test.ts`: private teamspace names, guests' pages from a teamspace, and single shared rows receive exactly their documents.
  - `model/src/tree.test.ts`, `model/src/sharing.test.ts`, `model/src/overrides.convergence.test.ts` and `model/src/database.convergence.test.ts`: convergence tests for moves, cycles, renames, access changes and cell edits under this split.
- `e2e/tests/access-scale.spec.ts`: at 2,272 pages, startup and sync stay within the old gate, and grow with the documents a person can open (findings, risk 3).

## Consequences
- **Startup cost is per document.** A person's devices load one document per page they can open, plus their index. A 2,000-row database is 2,002 documents, where the first spikes had one.
- The sidebar is complete only once every page document has loaded locally (5.8 s for 1,973 documents in the spike), not after one small document.
- The server decodes every page's `meta` and `access` to work out levels and write indexes, at startup and on each change.
- Two devices of one person may briefly derive different trees while their index is still arriving, and people with different access legitimately see different trees (a cycle through a page someone cannot see is no cycle for them). Access is always computed on the server's full tree.
- **Select and multi-value properties** need a design for where option names live: with single-row sharing, options stored with the properties would reach everyone given one row. The spike left them out (see "Not decided yet" in the [index](README.md)).
- Besides the indexes, the server writes documents only to add new people to default teamspaces. Everything else is written by devices and checked by the server.
