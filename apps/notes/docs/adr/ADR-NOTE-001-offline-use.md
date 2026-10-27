# ADR-NOTE-001. How does the app keep working without a network?

- Status: Accepted
- Date: 2026-10-17
- Depends on: [ADR-NOTE-004](ADR-NOTE-004-hosting-and-scale.md), [ADR-NOTE-009](ADR-NOTE-009-identity.md), [ADR-NOTE-011](ADR-NOTE-011-access-control.md)
- Dependency of: [ADR-NOTE-002](ADR-NOTE-002-merging-edits.md), [ADR-NOTE-003](ADR-NOTE-003-app-delivery.md), [ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md), [ADR-NOTE-013](ADR-NOTE-013-data-layout.md)

## Context

Full offline use is a core requirement. Under Notion's access model ([ADR-NOTE-011](ADR-NOTE-011-access-control.md)) a device may only hold what its person can open, and lost access must remove data. The server refuses edits below Can edit after the device has applied them.

## Decision

- **Local first:** every read and write hits the local copy; the UI never waits on the network.
- The server is one more participant (relay, backup). It never approves an edit before it shows, but checks each change against access on sync ([ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md)).
- **Each device keeps everything its person can open**, so any such page opens offline, even one never opened there. Nothing else arrives except random ids ([ADR-NOTE-013](ADR-NOTE-013-data-layout.md)).
- **Lost access:** data stays until the next sync, then leaves memory and storage. Unsynced edits come back as a new Private page holding the page as the device had it (the whole page: a Yjs update can't be split into server and device parts).
- **Refused change:** the device drops that document and re-syncs it. The UI hides what the level forbids, so only a device whose access dropped while offline, or a modified client, loses work.
- Offline is a status ("Offline · saved locally"), never an error. Detected at once from `offline`/`online` events; the socket close completes locally without waiting for a handshake.

## Alternatives considered

- **Whole workspace on every device:** private and singly shared pages would reach people who mustn't see them.
- **Offline mode on a server-first app:** a second, rarely exercised code path.

## Evidence

- PR #1 ([`research/04-spike-findings.md`](../research/04-spike-findings.md)) → offline start, offline/online merges, sync after server downtime, new device gets everything.
- PR #2 ([`research/05-spike-2-findings.md`](../research/05-spike-2-findings.md)) → conflicting offline moves converge; 5,000-row database reloads offline in ~0.5 s.
- Access spike ([`research/07-access-spike-findings.md`](../research/07-access-spike-findings.md)), `spikes/notes-access-sync-poc/`:
  - `e2e/tests/private-pages.spec.ts`, `e2e/tests/guests.spec.ts`, `server/testing/sync-boundary.test.ts` → devices hold exactly what their person can open.
  - `e2e/tests/losing-access.spec.ts`, `server/testing/losing-access.test.ts` → lost pages leave IndexedDB (online and on reconnect) and return with access; edits offered as Private page; removed person's device deletes the workspace.
  - `e2e/tests/rejecting-edits.spec.ts` → Can comment opens read-only; a refused edit leaves memory and storage.
  - `e2e/tests/collaboration.spec.ts` → offline edit merges with a live one.
  - `e2e/tests/access-scale.spec.ts` → offline badge switches at once (was "Synced" for ~36 s).

## Consequences

- Device storage and memory grow with what the person can open, at most the workspace; fine at [ADR-NOTE-004](ADR-NOTE-004-hosting-and-scale.md)'s scale.
- A device that never syncs keeps what it has; a removed person's device must still reach the server to be told "no access". Signing out or losing Notes access stops sync and leaves data ([ADR-NOTE-009](ADR-NOTE-009-identity.md)).
- A device reopens every stored document (incl. pages made offline before the server indexed them) and lets the server decide what's deleted.
- Memory and storage mechanics can change ("Not decided yet" in the [index](README.md)); holding everything openable can't.

## Changelog

- 2026-10-17: Devices keep only what their person can open, and delete lost pages at next sync, since any page can be private or shared alone ([ADR-NOTE-011](ADR-NOTE-011-access-control.md)). Refused changes re-sync; offline badge no longer waits on the handshake. Evidence: access spike ([`research/07-access-spike-findings.md`](../research/07-access-spike-findings.md), PR #23). Merged in from a separate ADR.
- 2026-10-16: Accepted. Every device kept the whole workspace, even after losing access. Evidence: PR #1, PR #2.
