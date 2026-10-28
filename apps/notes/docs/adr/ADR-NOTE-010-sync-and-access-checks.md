# ADR-NOTE-010. How do changes reach other devices, and how is access enforced on them?

- Status: Accepted
- Date: 2026-10-28
- Depends on: [ADR-NOTE-001](ADR-NOTE-001-offline-use.md), [ADR-NOTE-002](ADR-NOTE-002-merging-edits.md), [ADR-NOTE-005](ADR-NOTE-005-document-persistence.md), [ADR-NOTE-009](ADR-NOTE-009-identity.md), [ADR-NOTE-011](ADR-NOTE-011-access-control.md), [ADR-NOTE-012](ADR-NOTE-012-page-permissions.md), [ADR-NOTE-013](ADR-NOTE-013-data-layout.md)
- Dependency of: [ADR-NOTE-014](ADR-NOTE-014-http-and-accounts.md)

## Context

Access differs per document ([ADR-NOTE-011](ADR-NOTE-011-access-control.md), [ADR-NOTE-012](ADR-NOTE-012-page-permissions.md)) and every page is a Yjs document ([ADR-NOTE-002](ADR-NOTE-002-merging-edits.md), [ADR-NOTE-013](ADR-NOTE-013-data-layout.md)), so one socket carries thousands. Devices apply edits first ([ADR-NOTE-001](ADR-NOTE-001-offline-use.md)) and Yjs updates can't be undone. Hocuspocus's default (≤100 documents awaiting auth per connection) loops large workspaces into disconnects (PR #1).

## Decision

- **Hocuspocus 4**, limits raised to 20,000 pending documents, 100,000 queued messages, 256 MB: they guard public servers, and this endpoint is private and authenticated ([ADR-NOTE-009](ADR-NOTE-009-identity.md)).
- **Identity** once per connection, from the upgrade's gateway headers.
- **Open** (`onAuthenticate`, per document): below Can view → refused `no-access`; Can view/comment → read-only; above → read-write. An index opens read-only to its person only; a workspace document read-write to its members only.
- **Every update** (`beforeSync`, live or handshake) is checked on a scratch copy at the current level:

  | Level | Accepted |
  | --- | --- |
  | Below Can edit | nothing new |
  | Below Full access | no `access` changes |
  | Can edit content | rows only |
  | Any, new page or move | Can edit at the destination; Full access on the page if anyone's level changes |

  Full access skips the copy unless a quick scan finds a possible move.

- **Refusals** are whole and close only that document, reason `read-only`, `access-change-refused`, `placement-refused`, `structure-refused`, `teamspace-change-refused` or `last-owner`. The device destroys provider, `Y.Doc` and local storage, then reopens from the server (`sessionAwareness: true` keeps old and new providers apart).
- **Access changes apply live:** after each index change, that person's connections are re-checked; lost ones close with `access-revoked` (device deletes its copy), others switch read-only/writable.
- **In-memory catalog** of every page's `meta`/`access`, every teamspace and every workspace's members, read from storage at start and updated after each applied change, from which indexes are written ([ADR-NOTE-013](ADR-NOTE-013-data-layout.md)). Storage unchanged ([ADR-NOTE-005](ADR-NOTE-005-document-persistence.md)).
- **Index writes** use `disconnect({ unloadImmediately: false })`, so no device attaches to a dying document.
- **Providers start after the local copy loads**, so stored content rides the handshake (a live update on a read-only connection stays "not applied" forever).
- Gate: `SLOW=1` `spikes/notes-access-sync-poc/e2e/tests/access-scale.spec.ts`, until the real app has its own.

## Alternatives considered

- **Custom sync server:** Hocuspocus's limits are just settings.
- **Hocuspocus read-only mode:** drops updates silently.

## Evidence

- Access spike ([`research/07-access-spike-findings.md`](../research/07-access-spike-findings.md), risks 2–4), `spikes/notes-access-sync-poc/`:
  - `server/testing/rejecting-edits.test.ts` → forbidden edits refused, unstored, unrelayed; device recovers; other docs stay editable.
  - `server/testing/databases.test.ts` → Can edit content: rows yes, views/properties no.
  - `server/testing/losing-access.test.ts` → revocation and level changes apply live and on reconnect; removal test failed ~1 in 8 before the index-write fix.
  - `e2e/tests/rejecting-edits.spec.ts`, `e2e/tests/losing-access.spec.ts` → same in the browser.
- `apps/notes/server/test/server.test.ts` → the real server refuses another person a page, an entry for a non-member, a page in someone else's workspace or outside Private, a changed `workspaceId` and an access change below Full access, closing only that document; allowed edits apply.
- `access-scale.spec.ts` (2,272 pages, owner with 1,973 docs, headless Chromium, localhost, median of 9; no drops or refusals) vs PR #1's gate (2,001 docs, `spikes/notes-block-editing-collaboration-poc/e2e/tests/sync-scale.spec.ts`):

  | Phase | Now | Old gate |
  | --- | --- | --- |
  | New device | 5.8 s | 9.4 s |
  | Reconnect | 1.7 s | 1.7–2.0 s |
  | Server restart, two devices | 4.5 s | 7.5 s |
  | Warm reload | 5.9 s | 3.9 s (6.7 s for that test on the same machine) |

## Consequences

- **Not a plain relay:** decodes page metadata and access; copies a document per reviewed update below Full access.
- Replacing Hocuspocus rewrites the server sync layer, review hooks and one client component; no data migration (plain Yjs).
- Close reasons carry the meaning: Hocuspocus 4.7.1 sends every per-document close as code 1000.
- Startup grows with openable documents; `getPendingDocumentCount` is O(n²) per connection.
- Hocuspocus bugs to report upstream or guard against: the spike findings' "To report upstream" list.
- The first spikes' sync code has three bugs (hung offline close, read-only docs stuck "Syncing", quadratic startup); follow this spike's fixes.
- Revisit if the gate fails at supported sizes, per-document overhead dominates on devices, or Hocuspocus blocks e.g. batched sync.
- Hocuspocus's Yjs support constrains upgrades ([#4](https://github.com/christiannaths/homelab/issues/4)).

## Changelog

- 2026-10-28: Workspace documents and workspace members in the catalog, since an instance holds many workspaces ([ADR-NOTE-011](ADR-NOTE-011-access-control.md), issue #131, spec #130).
- 2026-10-17: Access checked per document and update, not once per connection, since per-document access ([ADR-NOTE-011](ADR-NOTE-011-access-control.md), [ADR-NOTE-012](ADR-NOTE-012-page-permissions.md)) let readers write. Gate moved to `access-scale.spec.ts`. Evidence: access spike ([`research/07-access-spike-findings.md`](../research/07-access-spike-findings.md), PR #23). Merged in from a separate ADR.
- 2026-10-16: Accepted. Hocuspocus 4, limits raised, session checked per connection. Gate: `spikes/notes-block-editing-collaboration-poc/e2e/tests/sync-scale.spec.ts`, 2,000 pages. Evidence: PR #1.
