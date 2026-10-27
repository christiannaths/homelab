# ADR-NOTE-011. How does an instance control who can see and change each page?

- Status: Accepted
- Date: 2026-10-17
- Depends on: [ADR-NOTE-009](ADR-NOTE-009-identity.md)
- Dependency of: [ADR-NOTE-001](ADR-NOTE-001-offline-use.md), [ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md), [ADR-NOTE-012](ADR-NOTE-012-page-permissions.md), [ADR-NOTE-013](ADR-NOTE-013-data-layout.md), [ADR-NOTE-014](ADR-NOTE-014-http-and-accounts.md)

## Context

A few trusted people share an instance, but drafts and journals are personal, and outsiders (a contractor, a babysitter) need a few pages only. Notion's model is familiar and covers this. Devices hold what their person can open ([ADR-NOTE-001](ADR-NOTE-001-offline-use.md)), so access also decides what syncs ([ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md)).

## Decision

- **Notion's model** (details: [access specs](../specs/access/README.md)):

  | Part | Rule |
  | --- | --- |
  | Workspace roles | owner, member, guest; one instance = one workspace |
  | Teamspaces | open, closed or private, optionally default; owners, members, default levels. Teamspace owners always have Full access. Open: non-joined members open pages at the non-member level (Can view, Can comment or Can edit) |
  | Private / Shared sections | Moving a page to Private removes others' access; explicit subpage invites stay (as Notion), top of the invitee's Shared |
  | Page sharing | Share menu with levels ([ADR-NOTE-012](ADR-NOTE-012-page-permissions.md)) and general access; subpages inherit; any page may expand or restrict; most permissive wins |
  | Guests | only pages shared with them and subpages; no Private, no teamspaces, never general access |

- **Paid-plan features always on**; Enterprise-only roles, groups and per-row database rules left out.
- **Devices get only what their person can open** (titles, content, teamspace names, search results). Workspace owners also get every private teamspace's name, not its pages unless members. Hidden ids may arrive as references ([ADR-NOTE-013](ADR-NOTE-013-data-layout.md)).
- **Changes apply at next sync;** lost pages are deleted, unsynced edits offered as a new Private page ([ADR-NOTE-001](ADR-NOTE-001-offline-use.md)).
- **Access changes are ordinary edits:** offline-capable and convergent.

## Alternatives considered

- **Custom model** (partial space shares, new-page rules, one sharing tree): flexibility not worth a new model to learn.

## Evidence

- Access spike ([`research/07-access-spike-findings.md`](../research/07-access-spike-findings.md)), `spikes/notes-access-sync-poc/`:
  - `server/testing/sync-boundary.test.ts`, `server/testing/overrides.test.ts`, `server/testing/teamspaces.test.ts`, `server/testing/guests.test.ts`, `server/testing/databases.test.ts` → exactly what's openable arrives, no hidden title, teamspace name or row value; private teamspace names reach workspace owners and members only; open teamspaces reach non-joined members.
  - `server/testing/losing-access.test.ts`, `e2e/tests/losing-access.spec.ts` → lost pages leave devices online and offline, incl. moves and removals; edits offered back as Private.
  - `model/src/access.test.ts`, `model/src/overrides.test.ts`, `model/src/teamspaces.test.ts`, `model/src/guests.test.ts` → inheritance, overrides, most-permissive-wins, teamspace kinds and defaults, guest limits.
  - `model/src/sharing.test.ts`, `model/src/overrides.convergence.test.ts` → concurrent access changes and moves converge.
- `spikes/notes-access-sync-poc/e2e/tests/access-scale.spec.ts` → 2,272 pages: per-person sync as fast as whole-workspace.
- [`research/06-notion-access-verification.md`](../research/06-notion-access-verification.md) → checked against Notion's help centre ("Sharing & permissions", "Intro to teamspaces", "Who's who in a workspace"); differences applied to the specs.

## Consequences

- Data is split across Yjs documents so each reaches exactly the allowed people ([ADR-NOTE-013](ADR-NOTE-013-data-layout.md)); sync checks each document and update ([ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md)).
- Where Notion is silent (moving pages, a guest's level on own subpages, owners' rights in teamspaces they're not in), specs record the spike's choice, pending a decision ("Not decided yet" in the [index](README.md)).
- Word "Private" honestly: the server admin can read everything (no end-to-end encryption).
