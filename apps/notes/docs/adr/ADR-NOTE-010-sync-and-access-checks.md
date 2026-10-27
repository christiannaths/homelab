# ADR-NOTE-010. How do changes reach other devices, and how is access enforced on them?

- Status: Accepted
- Date: 2026-10-17
- Depends on: [ADR-NOTE-001](ADR-NOTE-001-offline-use.md), [ADR-NOTE-002](ADR-NOTE-002-merging-edits.md), [ADR-NOTE-005](ADR-NOTE-005-document-persistence.md), [ADR-NOTE-009](ADR-NOTE-009-identity.md), [ADR-NOTE-011](ADR-NOTE-011-access-control.md), [ADR-NOTE-012](ADR-NOTE-012-page-permissions.md), [ADR-NOTE-013](ADR-NOTE-013-data-layout.md)
- Dependency of: [ADR-NOTE-014](ADR-NOTE-014-http-and-accounts.md)

## Context

Access differs per document ([ADR-NOTE-011](ADR-NOTE-011-access-control.md), [ADR-NOTE-012](ADR-NOTE-012-page-permissions.md)), and every page is a document ([ADR-NOTE-013](ADR-NOTE-013-data-layout.md)), so a device syncs thousands of Yjs documents ([ADR-NOTE-002](ADR-NOTE-002-merging-edits.md)) over one socket. Devices apply edits before the server sees them ([ADR-NOTE-001](ADR-NOTE-001-offline-use.md)), and Yjs updates can't be taken back. Hocuspocus's anti-abuse default (≤100 documents awaiting auth per connection) disconnects large workspaces in a loop (PR #1).

## Decision

- **Hocuspocus 4**, limits raised (20,000 pending documents, 100,000 queued messages, 256 MB): they guard public servers; this endpoint is private and authenticated ([ADR-NOTE-009](ADR-NOTE-009-identity.md)).
- **Identity once per connection**, from the upgrade's gateway headers.
- **Access per document** (`onAuthenticate`): below Can view → refused `no-access`; Can view or Can comment → read-only; above → read-write.
- **Every update reviewed before applying** (`beforeSync`), live or reconnect handshake, at the current level, on a scratch copy:

  | Level | May change |
  | --- | --- |
  | Below Can edit | nothing new |
  | Below Full access | anything but `access` |
  | Can edit content | rows only |
  | New page or move | needs Can edit where it lands, plus Full access on the page if anyone's level changes |

  Full access updates skip the copy unless a quick scan shows a possible move.

- **Refusal is whole and closes only that document**, reason `read-only`, `access-change-refused`, `placement-refused`, `structure-refused`, `teamspace-change-refused` or `last-owner`. The device then destroys provider, `Y.Doc` and local storage and reopens from the server; `sessionAwareness: true` keeps a reopened provider distinct from the closing one.
- **Access changes reach open connections at once:** after each index change the server re-checks that person's connections, closing lost ones with `access-revoked` (device deletes its copy) and switching the rest read-only or writable.
- **In-memory catalog** of every page's `meta` and `access` and every teamspace, loaded at startup, updated per change; indexes are written from it ([ADR-NOTE-013](ADR-NOTE-013-data-layout.md)). Storage unchanged ([ADR-NOTE-005](ADR-NOTE-005-document-persistence.md)).
- **Index writes keep the document loaded** (`disconnect({ unloadImmediately: false })`), so no device attaches to a document being destroyed.
- **Devices create a provider only after the local copy loads**, so stored content goes in the handshake, not as a live update a read-only connection answers "not applied" forever.
- Gate until the real app has its own: `SLOW=1` `spikes/notes-access-sync-poc/e2e/tests/access-scale.spec.ts`.

## Alternatives considered

- **Custom sync server** on the Yjs protocol: Hocuspocus's limits are just settings.
- **Hocuspocus's read-only mode:** drops updates silently.

## Evidence

- Access spike ([`research/07-access-spike-findings.md`](../research/07-access-spike-findings.md), risks 2–4), `spikes/notes-access-sync-poc/`:
  - `server/testing/rejecting-edits.test.ts` → forbidden edits refused, unstored, unrelayed; device recovers; other docs stay editable; raised level applies live.
  - `server/testing/databases.test.ts` → Can edit content: rows yes, views and properties no.
  - `server/testing/losing-access.test.ts` → revocation closes live and refuses on reconnect; level changes apply both ways; removal test failed ~1 in 8 until index writes stopped unloading.
  - `e2e/tests/rejecting-edits.spec.ts`, `e2e/tests/losing-access.spec.ts` → same in the browser.
- `access-scale.spec.ts` (2,272 pages, owner with 1,973 docs, headless Chromium, localhost, median of 9; no drops or refusals) vs PR #1 gate (2,001 docs, `spikes/notes-block-editing-collaboration-poc/e2e/tests/sync-scale.spec.ts`):

  | Phase | Now | Old gate |
  | --- | --- | --- |
  | New device | 5.8 s | 9.4 s |
  | Reconnect | 1.7 s | 1.7–2.0 s |
  | Server restart, two devices | 4.5 s | 7.5 s |
  | Warm reload | 5.9 s | 3.9 s (6.7 s for that spike's test on the same machine) |

## Consequences

- **Not a plain relay:** the server decodes page metadata and access, and copies a document per reviewed update below Full access.
- Clients and storage are plain Yjs; replacing Hocuspocus rewrites the server sync layer, review hooks and one client component, with no data migration.
- Close reasons distinguish refusals, since Hocuspocus 4.7.1 sends per-document closes as code 1000.
- Startup grows with openable documents (per-document auth and sync; `getPendingDocumentCount` is O(n²) per connection).
- **Report upstream or guard:** unload race; `connect()` returning early while Connected and `checkConnection` never timing out a silent socket; quadratic pending count; dropped close code; silent read-only refusal.
- The first spikes' sync code has three gate-found bugs (hung offline close, read-only docs stuck "Syncing" after reload, quadratic startup); follow this spike's fixes.
- Revisit if the gate fails at supported sizes, per-document overhead dominates on real devices, or Hocuspocus blocks e.g. batched sync.
- Hocuspocus's Yjs support constrains upgrades ([#4](https://github.com/christiannaths/homelab/issues/4)).

## Changelog

- 2026-10-17: Access checked per document and per update, not once per connection, since per-document access ([ADR-NOTE-011](ADR-NOTE-011-access-control.md), [ADR-NOTE-012](ADR-NOTE-012-page-permissions.md)) let readers write and devices apply edits first. Gate moved to `access-scale.spec.ts`. Evidence: access spike ([`research/07-access-spike-findings.md`](../research/07-access-spike-findings.md), PR #23). Merged in from a separate ADR.
- 2026-10-16: Accepted. Hocuspocus 4 over a custom server, limits raised, session checked per connection. Gate: `spikes/notes-block-editing-collaboration-poc/e2e/tests/sync-scale.spec.ts`, 2,000 pages. Evidence: PR #1.
