# ADR-NOTE-013. How is data laid out so each person receives only what they can open?

- Status: Accepted
- Date: 2026-10-17
- Depends on: [ADR-NOTE-001](ADR-NOTE-001-offline-use.md), [ADR-NOTE-002](ADR-NOTE-002-merging-edits.md), [ADR-NOTE-006](ADR-NOTE-006-merge-safety.md), [ADR-NOTE-009](ADR-NOTE-009-identity.md), [ADR-NOTE-011](ADR-NOTE-011-access-control.md), [ADR-NOTE-012](ADR-NOTE-012-page-permissions.md)
- Dependency of: [ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md)

## Context

A Yjs document ([ADR-NOTE-002](ADR-NOTE-002-merging-edits.md)) syncs whole, and devices may only get what their person can open ([ADR-NOTE-001](ADR-NOTE-001-offline-use.md), [ADR-NOTE-011](ADR-NOTE-011-access-control.md)). The first spikes' single workspace tree and per-database rows leak titles and values, since any page or row can be shared alone or set to No access ([ADR-NOTE-012](ADR-NOTE-012-page-permissions.md)); access data has the same problem. Everything must merge under [ADR-NOTE-006](ADR-NOTE-006-merge-safety.md).

## Decision

- **A document is the unit of access:** it holds only data for exactly the same people, and nothing is duplicated.

  | Document | Holds | Reaches |
  | --- | --- | --- |
  | `page:<id>` | `meta` (`title`, `kind` page/database/row, `parentId`, `section`, `order`, `createdAt`, `deletedAt`); `access` (`person:<id>`, `workspace` = general access, `teamspace` = members' level override; absent = inherit); `content` | who can open the page |
  | `index:<personId>` | ids of openable pages and teamspaces with level, no titles; server-written | that person, read-only |
  | `teamspace:<id>` | name, kind, default flag, members' and non-members' level; members | open/closed: all workspace members; private: members and workspace owners; never guests |
  | `schema:<id>` | a database's properties | anyone who can open the database or any row (Can view for the latter) |

  All maps are one key per field or entry.

- **No workspace document.** Devices derive their tree from received pages ([ADR-NOTE-006](ADR-NOTE-006-merge-safety.md) rule 1); an unreceived parent counts as missing, so the page is top level in Shared. A subpage takes its top-level ancestor's section; a move writes only `parentId`, `section`, `order`, in one transaction.
- **Devices read their level from the index**, never compute it (it depends on ancestors they may not hold).
- **Databases:** the database page holds title, access, body and views; each **row is a page** (`kind` row, `parentId` = database) with title, order, cells (one key per property) and body, inheriting access and shareable alone.
- **People and workspace roles are server account data** ([ADR-NOTE-009](ADR-NOTE-009-identity.md)), never edited offline, so not Yjs.
- **Ids are random UUIDs** and may leak as references (a hidden parent's or database's id as `parentId`; for guests, a teamspace id as `section`); titles, names and content never do.
- **An unseen page id** can be opened by any member or guest so it can be created; the server reviews the update that places it ([ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md)). Safe only because ids are random.

## Alternatives considered

- **Per-person filtered tree, server-written:** server becomes a merge point translating every write; offline moves force server repairs (against [ADR-NOTE-006](ADR-NOTE-006-merge-safety.md) rule 1); titles stored per person.
- **Tree document per Private section or teamspace:** a restricted or singly shared subpage's title stays in it.
- **Separate `meta:<id>` per page:** doubles documents, duplicates access, adds "meta without content". Kept as fallback for slow startup, which didn't happen.
- **One hidden workspace document:** titles reach every device.
- **Access in `access:<id>`** (doubles documents), **SQLite + HTTP** (no offline sharing or merge, against [ADR-NOTE-002](ADR-NOTE-002-merging-edits.md)), or **the index** (server fans out every change; Share menu needs others' entries).
- **Cells in the database document** (one shared row leaks all), **properties copied per row** (fan-out), **properties in the database page** (leaks views and title to single-row guests).

## Evidence

- Access spike ([`research/07-access-spike-findings.md`](../research/07-access-spike-findings.md), risk 1), `spikes/notes-access-sync-poc/`:
  - `server/testing/sync-boundary.test.ts` → Private pages never leak by document or title; indexes read-only, refused to others.
  - `server/testing/overrides.test.ts` → page without its parent lands top of Shared, no trace of the parent.
  - `server/testing/teamspaces.test.ts`, `server/testing/guests.test.ts`, `server/testing/databases.test.ts` → private teamspaces, guests' teamspace pages and single rows get exactly their documents.
  - `model/src/tree.test.ts`, `model/src/sharing.test.ts`, `model/src/overrides.convergence.test.ts`, `model/src/database.convergence.test.ts` → moves, cycles, renames, access changes, cell edits converge.
- `spikes/notes-access-sync-poc/e2e/tests/access-scale.spec.ts` → 2,272 pages within the old gate; cost grows with openable documents (risk 3).

## Consequences

- **Startup cost is per document:** one per openable page plus the index; a 2,000-row database is 2,002 documents.
- The sidebar is complete only after all page documents load (5.8 s for 1,973 in the spike).
- The server decodes every `meta` and `access` at startup and per change.
- One person's devices may briefly derive different trees while the index arrives; different people legitimately see different trees (a cycle through a hidden page isn't one for them). Access is always computed on the server's full tree.
- **Select and multi-value properties** need a home for option names that doesn't leak via one row; left out ("Not decided yet" in the [index](README.md)).
- Besides indexes, the server only writes to add new people to default teamspaces; devices write everything else, server-checked.
