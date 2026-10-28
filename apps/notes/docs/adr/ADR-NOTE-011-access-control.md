# ADR-NOTE-011. How does an instance control who can see and change each page?

- Status: Accepted
- Date: 2026-10-28
- Depends on: [ADR-NOTE-009](ADR-NOTE-009-identity.md)
- Dependency of: [ADR-NOTE-001](ADR-NOTE-001-offline-use.md), [ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md), [ADR-NOTE-012](ADR-NOTE-012-page-permissions.md), [ADR-NOTE-013](ADR-NOTE-013-data-layout.md), [ADR-NOTE-014](ADR-NOTE-014-http-and-accounts.md)

## Context

Drafts and journals are personal, and outsiders (a contractor, a babysitter) need a few pages only. Notion's model is familiar and covers this. Devices hold what their person can open ([ADR-NOTE-001](ADR-NOTE-001-offline-use.md)), so access also decides what syncs.

## Decision

- **Notion's model** (details: [access specs](../specs/access/README.md)):

  | Part | Rule |
  | --- | --- |
  | Workspaces | an instance holds many; anyone with Notes access creates them and owns the ones they create; everyone gets a default one on first open |
  | Workspace roles | owner, member, guest, per workspace |
  | Teamspaces | open, closed or private, optionally default; owners (always Full access), members, default levels. Open: non-joined members get the non-member level (Can view, comment or edit) |
  | Private / Shared | Moving to Private removes others' access; explicit subpage invites stay, top of the invitee's Shared (as Notion) |
  | Page sharing | levels ([ADR-NOTE-012](ADR-NOTE-012-page-permissions.md)) and general access; subpages inherit; any page may expand or restrict; most permissive wins |
  | Guests | only pages shared with them and subpages; no Private, teamspaces or general access |

- **Paid-plan features always on**; Enterprise-only roles, groups and per-row rules left out.
- **Devices get only what's openable**, incl. teamspace names and search results; workspace owners also get private teamspace names (not pages). Ids may leak as references ([ADR-NOTE-013](ADR-NOTE-013-data-layout.md)).
- **Access changes are ordinary edits:** offline-capable, convergent, applied at next sync ([ADR-NOTE-001](ADR-NOTE-001-offline-use.md)).

## Alternatives considered

- **Custom model** (partial space shares, new-page rules, one sharing tree): not worth a new model to learn.

## Evidence

- Access spike ([`research/07-access-spike-findings.md`](../research/07-access-spike-findings.md)), `spikes/notes-access-sync-poc/`:
  - `server/testing/sync-boundary.test.ts`, `server/testing/overrides.test.ts`, `server/testing/teamspaces.test.ts`, `server/testing/guests.test.ts`, `server/testing/databases.test.ts` → only what's openable arrives; no hidden title, teamspace name or row value.
  - `server/testing/losing-access.test.ts`, `e2e/tests/losing-access.spec.ts` → lost pages leave devices, online and offline.
  - `model/src/access.test.ts`, `model/src/overrides.test.ts`, `model/src/teamspaces.test.ts`, `model/src/guests.test.ts` → inheritance, overrides, most-permissive-wins, teamspaces, guests.
  - `model/src/sharing.test.ts`, `model/src/overrides.convergence.test.ts` → concurrent access changes and moves converge.
- `spikes/notes-access-sync-poc/e2e/tests/access-scale.spec.ts` → 2,272 pages: per-person sync as fast as whole-workspace.
- `apps/notes/server/test/server.test.ts` ("the default workspace", "sync"), `apps/notes/e2e/tests/notes-app.test.ts` → one default workspace per person at either App access level; others refused its documents.
- `apps/notes/server/test/server.test.ts` ("another workspace"), `apps/notes/e2e/tests/workspaces.test.ts` → anyone with Notes access makes more workspaces, owning each; others refused them.
- [`research/06-notion-access-verification.md`](../research/06-notion-access-verification.md) → checked item by item against Notion's help centre; differences applied to the specs.

## Consequences

- Where Notion is silent, specs record the spike's choice, pending a decision ("Not decided yet" in the [index](README.md)).
- "Private" must be worded honestly: the server admin can read everything (no end-to-end encryption).

## Changelog

- 2026-10-28: An instance holds many workspaces, made by anyone with Notes access, who owns them; each person gets a default one on first open, since Notes is useless without one and a household may want separate areas (issue #131, spec #130).
- 2026-10-17: Accepted. Notion's model, one instance = one workspace.
