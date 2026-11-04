# ADR-NOTE-013. How is data laid out so each person receives only what they can open?

- Status: Accepted
- Date: 2026-10-28
- Depends on: [ADR-NOTE-001](ADR-NOTE-001-offline-use.md), [ADR-NOTE-002](ADR-NOTE-002-merging-edits.md), [ADR-NOTE-006](ADR-NOTE-006-merge-safety.md), [ADR-NOTE-009](ADR-NOTE-009-identity.md), [ADR-NOTE-011](ADR-NOTE-011-access-control.md), [ADR-NOTE-012](ADR-NOTE-012-page-permissions.md)
- Dependency of: [ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md)

## Context

A Yjs document ([ADR-NOTE-002](ADR-NOTE-002-merging-edits.md)) syncs whole, and devices get only what their person can open ([ADR-NOTE-001](ADR-NOTE-001-offline-use.md), [ADR-NOTE-011](ADR-NOTE-011-access-control.md)). The first spikes' workspace tree and per-database rows leaked titles and values, since any page or row can be shared alone or set to No access ([ADR-NOTE-012](ADR-NOTE-012-page-permissions.md)).

## Decision

- **A document is the unit of access:** only data for exactly the same people, nothing duplicated. Maps are one key per field or entry.

  | Document | Holds | Reaches |
  | --- | --- | --- |
  | `page:<id>` | `meta` (`workspaceId`, never changed; `title`, `kind` page/database/row, `parentId`, `section`, `order`, `createdAt`, `deletedAt`); `access` (`person:<id>`, `workspace` = general access, `teamspace` = members' level override; absent = inherit); `content` | who can open the page |
  | `index:<personId>` | `pages` (id → level), `workspaces` (ids), teamspace ids with level; no names or titles; server-written | that person, read-only |
  | `workspace:<id>` | `workspace` (`name`) | the workspace's members |
  | `teamspace:<id>` | name, kind, default flag, members' and non-members' level; members | open/closed: all workspace members; private: members and workspace owners; never guests |
  | `schema:<id>` | a database's properties | anyone who can open the database or any row (Can view for the latter) |

- **No document holds the page tree.** Devices derive it from received pages ([ADR-NOTE-006](ADR-NOTE-006-merge-safety.md) rule 1); an unreceived parent counts as missing, so the page is top level in Shared. Subpages take their top-level ancestor's section; a move writes only `parentId`, `section`, `order`, in one transaction.
- **Devices read their level from the index**, never compute it (it depends on ancestors they may lack).
- **Databases:** the database page holds title, access, body, views. Each **row is a page** (`kind` row, `parentId` = database): title, order, cells (one key per property), body; inherits access, shareable alone.
- **People, workspaces and their members with roles** are server account data in SQLite ([ADR-NOTE-009](ADR-NOTE-009-identity.md), [ADR-NOTE-011](ADR-NOTE-011-access-control.md)), never edited offline, so not Yjs. Only a workspace's name is Yjs, so renaming works offline and merges.
- **Ids are random UUIDs** and may arrive as references (a hidden parent's or database's id as `parentId`; for guests, a teamspace id as `section`); titles, names, content never do.
- **An unseen page id** can be opened by any member or guest so it can be created; the server reviews the update placing it ([ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md)). Safe only because ids are random.

## Alternatives considered

- **Server-written per-person tree:** makes the server a merge point that repairs (against [ADR-NOTE-006](ADR-NOTE-006-merge-safety.md) rule 1).
- **Tree per Private section or teamspace:** leaks restricted subpages' titles.
- **`meta:<id>` beside each page:** doubles documents; unneeded, as startup was fast.
- **Workspace document holding the tree:** titles reach every device.
- **Workspace name in SQLite + HTTP:** no offline rename.
- **Access in `access:<id>`:** doubles documents.
- **Access in SQLite + HTTP:** no offline sharing or merge ([ADR-NOTE-002](ADR-NOTE-002-merging-edits.md)).
- **Access in the index:** Share menu needs others' entries.
- **Cells in the database document:** one shared row leaks all rows.
- **Properties copied per row:** fan-out on every property change.
- **Properties in the database page:** leaks views and title to single-row guests.

## Evidence

- Access spike ([`research/07-access-spike-findings.md`](../research/07-access-spike-findings.md), risk 1), `spikes/notes-access-sync-poc/`:
  - `server/testing/sync-boundary.test.ts` → Private pages never leak; indexes refused to others.
  - `server/testing/overrides.test.ts` → page without its parent lands top of Shared, no trace of the parent.
  - `server/testing/teamspaces.test.ts`, `server/testing/guests.test.ts`, `server/testing/databases.test.ts` → private teamspaces, guests and single rows get exactly their documents.
  - `model/src/tree.test.ts`, `model/src/sharing.test.ts`, `model/src/overrides.convergence.test.ts`, `model/src/database.convergence.test.ts` → moves, cycles, renames, access changes, cell edits converge.
- `apps/notes/server/test/server.test.ts` → the index lists exactly the person's workspaces and pages with levels; index, workspace and page documents refused to others; a device's index change refused; all survive a restart.
- `spikes/notes-access-sync-poc/e2e/tests/access-scale.spec.ts` → 2,272 pages within the old gate (risk 3).

## Consequences

- **Startup cost is per document:** one per openable page, plus the index; the sidebar is complete only once all load (5.8 s for 1,973 in the spike).
- Trees can differ: briefly across one person's devices while the index arrives, and legitimately between people (a cycle through a hidden page isn't one). Access is always computed on the server's full tree.
- Besides indexes, the server writes only a new workspace's name and first page (an empty one in its owner's Private section, so two devices opening Notes for the first time at once don't each make one) and new people's default-teamspace membership.
- Creating a workspace needs a connection: membership is server data.

## Changelog

- 2026-10-28: Every new workspace gets a server-written first page, not only a new person's default one, so each opens on a page (issue #136, spec #130).
- 2026-10-28: The server writes a new person's first page, and `meta` names the page's workspace, since pages arrived in the real app (issue #133, spec #130).
- 2026-10-28: Workspaces and members in SQLite, each workspace's name in `workspace:<id>`, the index lists workspaces, since an instance holds many workspaces ([ADR-NOTE-011](ADR-NOTE-011-access-control.md), issue #131, spec #130).
- 2026-10-17: Accepted. Page, index, teamspace and schema documents; no workspace document; people and roles server data.
