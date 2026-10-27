# ADR-NOTE-012. How finely can access to a page be granted?

- Status: Accepted
- Date: 2026-10-17
- Depends on: [ADR-NOTE-011](ADR-NOTE-011-access-control.md)
- Dependency of: [ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md), [ADR-NOTE-013](ADR-NOTE-013-data-layout.md)

## Context

[ADR-NOTE-011](ADR-NOTE-011-access-control.md) decides who opens a page; some should only read or comment (a babysitter's house manual). Notion's levels are familiar.

## Decision

- **Every grant has a level:**

  | Level | Allows |
  | --- | --- |
  | Full access | read, comment, edit, share |
  | Can edit | read, comment, edit |
  | Can edit content (databases) | rows: add, edit, trash, incl. values and bodies; not the database page, properties, views, sorts, filters |
  | Can comment | read, comment |
  | Can view | read |
  | No access | restricts an inherited level |

- **Only Full access shares**; a move that changes anyone's level needs Full access on the page.
- **Most permissive wins.** Per-person No access replaces only that person's entry; Private and teamspace owners always keep Full access.
- The server rejects edits below Can edit on sync ([ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md)); read-only copies still work offline.
- Until comments exist, Can comment = Can view.

## Evidence

- Access spike ([`research/07-access-spike-findings.md`](../research/07-access-spike-findings.md)), `spikes/notes-access-sync-poc/`:
  - `model/src/access.test.ts`, `model/src/overrides.test.ts` → levels, overrides, most-permissive-wins incl. No access vs general access.
  - `server/testing/rejecting-edits.test.ts`, `e2e/tests/rejecting-edits.spec.ts` → read-only levels enforced; access changes refused below Full.
  - `server/testing/databases.test.ts`, `model/src/database.test.ts` → Can edit content: rows only.
  - `server/testing/teamspaces.test.ts` → teamspace owners keep Full access.
- Notion's "Sharing & permissions" → the levels; the move rule is the spike's choice.

## Consequences

- Database structure and rows live in separate documents so Can edit content is easy to check ([ADR-NOTE-013](ADR-NOTE-013-data-layout.md)).
