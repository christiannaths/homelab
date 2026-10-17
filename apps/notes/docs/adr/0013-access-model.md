# 13. Access follows Notion's model of teamspaces and page sharing

- Status: Accepted
- Date: 2026-10-17
- Depends on: [ADR 11](0011-local-accounts.md)
- Dependency of: [ADR 1](0001-offline-support.md), [ADR 12](0012-hocuspocus-sync-server.md), [ADR 14](0014-page-access-levels.md), [ADR 17](0017-per-page-documents.md), [ADR 18](0018-hono-and-better-auth.md)

## Context
An instance serves a few trusted people, but not everything is for everyone: drafts and journals are personal, and outsiders such as a contractor or babysitter need a handful of pages and nothing else. Several custom models were explored (partial shares of spaces, rules for new pages, a single sharing tree). Their extra flexibility did not justify the cost of a model users would have to learn. Notion's model is familiar to the intended users, and covers these cases. Each device holds a local copy of what its user can open ([ADR 1](0001-offline-support.md)), so access also decides what reaches each device, and every document is synced whole ([ADR 12](0012-hocuspocus-sync-server.md)).

## Decision
- **Access copies Notion's model**, as described in the [access specs](../specs/access/README.md):
  - **Workspace roles:** workspace owner, member and guest. One instance is one workspace.
  - **Teamspaces:** open, closed or private, optionally default, each with owners, members and default access levels. Teamspace owners always have Full access on its pages. On an open teamspace, workspace members who have not joined still open its pages, at the teamspace's level for non-members (Can view, Can comment or Can edit).
  - **Private and Shared sidebar sections.** Moving a page to Private removes everyone else's access to that page. Explicit invites set on its subpages stay, because that is what Notion does: a person invited to a subpage keeps it, at the top of their Shared section.
  - **Page sharing:** a Share menu with access levels ([ADR 14](0014-page-access-levels.md)) and general access. Subpages inherit, any page can expand or restrict what it inherits, and the most permissive level wins.
  - **Guests** get only the pages shared with them and their subpages: no Private section, no teamspaces, and never general access.
- **Features tied to Notion's paid plans are always available.** Enterprise-only roles, groups and per-row database rules are left out.
- **A person's devices only receive what that person can open.** That includes titles, contents, teamspace names and search results. Workspace owners also receive every private teamspace's name, but not its pages unless they are members. Random ids of hidden pages and teamspaces may reach a device as references inside pages the person can open ([ADR 17](0017-per-page-documents.md)).
- **Access changes take effect at the device's next sync.** When access is lost, the device deletes its local copies. Unsynced edits to those pages cannot be saved to them; the app says so and offers to keep the page, as the device had it, as a new Private page ([ADR 1](0001-offline-support.md)).
- **Access changes are ordinary edits:** they work offline, and concurrent changes converge to the same result on every device.

## Evidence
- The access spike ([`research/07-access-spike-findings.md`](../research/07-access-spike-findings.md)) built the model on per-person sync and tested it in `spikes/notes-access-sync-poc/`:
  - `server/testing/sync-boundary.test.ts`, `server/testing/overrides.test.ts`, `server/testing/teamspaces.test.ts`, `server/testing/guests.test.ts` and `server/testing/databases.test.ts`: each person receives exactly what they can open, with no hidden title, teamspace name or row value anywhere in what arrives. A private teamspace's name reaches workspace owners and members only, and an open teamspace's pages reach members who have not joined.
  - `server/testing/losing-access.test.ts` and `e2e/tests/losing-access.spec.ts`: lost pages leave devices online and offline, moves and removals included, and unsynced edits are offered back as a Private page.
  - `model/src/access.test.ts`, `model/src/overrides.test.ts`, `model/src/teamspaces.test.ts` and `model/src/guests.test.ts`: inheritance, overrides, most-permissive-wins, teamspace kinds and defaults, and guest limits.
  - `model/src/sharing.test.ts` and `model/src/overrides.convergence.test.ts`: concurrent access changes and moves converge.
- At 2,272 pages, per-person sync is as fast as whole-workspace sync on the same machine (`e2e/tests/access-scale.spec.ts`).
- The model follows Notion's help centre ("Sharing & permissions", "Intro to teamspaces", "Who's who in a workspace"), checked item by item in [`research/06-notion-access-verification.md`](../research/06-notion-access-verification.md). The differences it found are applied to the specs.

## Consequences
- Each device keeps everything its person can open, and data stays on it until the next sync after access is lost ([ADR 1](0001-offline-support.md)).
- Pages, the page tree, databases and access data are split across Yjs documents so that each document goes to exactly the people allowed to see it ([ADR 17](0017-per-page-documents.md)).
- The sync server checks access for each document and each update, not only the session on each connection ([ADR 12](0012-hocuspocus-sync-server.md)).
- Where Notion's help centre is silent (who may move a page, a guest's level on their own subpage, what workspace owners may change in teamspaces they are not in), the specs record the spike's choice, and "Not decided yet" in the [index](README.md) lists them for a product decision.
- Public read-only publishing of pages and subpages is still to be decided.
- What "Private" protects against must be worded honestly: the server administrator can read everything, because there is no end-to-end encryption.
