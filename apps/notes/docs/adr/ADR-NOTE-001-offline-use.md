# ADR-NOTE-001. How does the app keep working without a network?

- Status: Accepted
- Date: 2026-10-17
- Depends on: [ADR-NOTE-004](ADR-NOTE-004-hosting-and-scale.md), [ADR-NOTE-009](ADR-NOTE-009-identity.md), [ADR-NOTE-011](ADR-NOTE-011-access-control.md)
- Dependency of: [ADR-NOTE-002](ADR-NOTE-002-merging-edits.md), [ADR-NOTE-003](ADR-NOTE-003-app-delivery.md), [ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md), [ADR-NOTE-013](ADR-NOTE-013-data-layout.md)

## Context

Full offline use is a core requirement. Devices may only hold what their person can open, and lost access must remove data ([ADR-NOTE-011](ADR-NOTE-011-access-control.md)).

## Decision

- **Local first:** every read and write hits the local copy; the UI never waits on the network.
- The server is one more participant (relay, backup). It never approves an edit before it shows, but checks changes on sync ([ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md)).
- **Each device keeps everything its person can open**, so any of it opens offline, even if never opened there. Nothing else arrives but random ids ([ADR-NOTE-013](ADR-NOTE-013-data-layout.md)).
- **Lost access:** data stays until the next sync, then is deleted. Unsynced edits return as a new Private page with the whole page as the device had it (Yjs updates can't be split into server and device parts).
- **Refused change:** the device drops that document and re-syncs it. The UI hides what the level forbids, so only a device demoted while offline, or a modified client, loses work.
- Offline is a status ("Offline · saved locally"), not an error, detected at once from `offline`/`online` events; the socket close completes locally.

## Alternatives considered

- **Whole workspace on every device:** leaks private and singly shared pages.
- **Offline mode on a server-first app:** a rarely exercised second code path.

## Evidence

- PR #1 ([`research/04-spike-findings.md`](../research/04-spike-findings.md)) → offline start, offline/online merges, sync after server downtime, full new-device sync.
- PR #2 ([`research/05-spike-2-findings.md`](../research/05-spike-2-findings.md)) → offline moves converge; 5,000-row database reloads offline in ~0.5 s.
- Access spike ([`research/07-access-spike-findings.md`](../research/07-access-spike-findings.md)), `spikes/notes-access-sync-poc/`:
  - `e2e/tests/private-pages.spec.ts`, `e2e/tests/guests.spec.ts`, `server/testing/sync-boundary.test.ts` → devices hold exactly what's openable.
  - `e2e/tests/losing-access.spec.ts`, `server/testing/losing-access.test.ts` → lost pages leave IndexedDB and return with access; edits offered as Private; removed person's device empties.
  - `e2e/tests/rejecting-edits.spec.ts` → Can comment opens read-only; refused edits are dropped.
  - `e2e/tests/collaboration.spec.ts` → offline edit merges with a live one.
  - `e2e/tests/access-scale.spec.ts` → offline badge switches at once (was "Synced" for ~36 s).

## Consequences

- Device storage and memory grow with what's openable, at most the workspace ([ADR-NOTE-004](ADR-NOTE-004-hosting-and-scale.md)'s scale).
- A device that never syncs keeps its data; a removed person's device must still reach the server to hear "no access". Signing out or losing Notes access leaves data ([ADR-NOTE-009](ADR-NOTE-009-identity.md)).
- Devices reopen every stored document (incl. pages made offline, not yet indexed) and let the server decide deletions.
- Storage and memory mechanics may change ("Not decided yet" in the [index](README.md)); holding everything openable won't.

## Changelog

- 2026-10-17: Devices keep only what their person can open and delete lost pages at next sync, since any page can be private or shared alone ([ADR-NOTE-011](ADR-NOTE-011-access-control.md)); refused changes re-sync; badge no longer waits on the close handshake. Evidence: access spike ([`research/07-access-spike-findings.md`](../research/07-access-spike-findings.md), PR #23). Merged in from a separate ADR.
- 2026-10-16: Accepted. Devices kept the whole workspace, even after losing access. Evidence: PR #1, PR #2.
