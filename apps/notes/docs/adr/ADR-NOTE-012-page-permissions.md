# ADR-NOTE-012. How finely can access to a page be granted?

- Status: Accepted
- Date: 2026-10-17
- Depends on: [ADR-NOTE-011](ADR-NOTE-011-access-control.md)
- Dependency of: [ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md), [ADR-NOTE-013](ADR-NOTE-013-data-layout.md)

## Context

[ADR-NOTE-011](ADR-NOTE-011-access-control.md) decides who opens a page. Some should only read or comment (a babysitter's house manual, an accountant's summary). Notion's levels are familiar, so we copy them.

## Decision

- **Every grant has a level:**

  | Level | Allows |
  | --- | --- |
  | Full access | read, comment, edit, share |
  | Can edit | read, comment, edit |
  | Can edit content (databases) | add, edit, trash rows and their values and bodies; not the database page, properties, views, sorts, filters |
  | Can comment | read, comment |
  | Can view | read |
  | No access | restricts an inherited level |

- **Only Full access shares** or changes others' access; a move that changes anyone's level needs Full access on that page.
- **Most permissive wins** across sources. Per-person No access replaces only that person's entry, not general or teamspace access; Private section owners and teamspace owners always keep Full access.
- The UI hides what a level forbids; the server rejects edits below Can edit on sync, and the device re-syncs.
- Until comments exist, Can comment = Can view.

## Evidence

- Access spike ([`research/07-access-spike-findings.md`](../research/07-access-spike-findings.md)), `spikes/notes-access-sync-poc/`:
  - `model/src/access.test.ts`, `model/src/overrides.test.ts` → each level invited, expanded, restricted, restored; most permissive wins, incl. No access vs general access.
  - `server/testing/rejecting-edits.test.ts`, `e2e/tests/rejecting-edits.spec.ts` → Can view/comment read-only online and offline; forged edit refused, device recovers; access changes and access-changing moves refused below Full.
  - `server/testing/databases.test.ts`, `model/src/database.test.ts` → Can edit content: rows yes, views and properties no.
  - `server/testing/teamspaces.test.ts` → teamspace owners keep Full access despite member levels and overrides.
- Levels follow Notion's "Sharing & permissions"; the move rule is the spike's choice (undocumented by Notion).

## Consequences

- Sync checks each update against the person's level ([ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md)); database structure and rows live in separate documents to keep Can edit content simple ([ADR-NOTE-013](ADR-NOTE-013-data-layout.md)).
- Read-only copies work offline.
