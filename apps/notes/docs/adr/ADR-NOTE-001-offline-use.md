# ADR-NOTE-001. How does the app keep working without a network?

- Status: Accepted
- Date: 2026-10-17
- Depends on: [ADR-NOTE-004](ADR-NOTE-004-hosting-and-scale.md), [ADR-NOTE-009](ADR-NOTE-009-identity.md), [ADR-NOTE-011](ADR-NOTE-011-access-control.md)
- Dependency of: [ADR-NOTE-002](ADR-NOTE-002-merging-edits.md), [ADR-NOTE-003](ADR-NOTE-003-app-delivery.md), [ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md), [ADR-NOTE-013](ADR-NOTE-013-data-layout.md)

## Context

Full offline support is a core requirement. Access follows Notion's model ([ADR-NOTE-011](ADR-NOTE-011-access-control.md)): a person's devices may only receive what that person can open, and losing access must remove data from their devices. Edits from people below Can edit are refused by the server, after the device has already applied them.

## Decision

- **Every read and write goes to the local copy first.** The UI never waits on the network to show or change anything.
- The network is used only to exchange changes with other devices. The server is one more participant that relays and backs up changes. It never has to approve an edit before it appears on the device, but it checks each change against the person's access when it syncs, and refuses those that access does not allow ([ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md)).
- **Each device keeps everything its person can open**, not only the pages it has opened. Any page the person can open opens offline, including one the device has never opened before. Nothing the person cannot open reaches the device, apart from the random ids described in [ADR-NOTE-013](ADR-NOTE-013-data-layout.md).
- **Data stays on a device until the next sync after its person loses access.** The device then deletes it from memory and storage. Unsynced edits to a lost page are offered back as a new Private page holding the page as the device had it.
- **A refused change is discarded:** the device throws away its copy of that document and syncs it again from the server. The UI does not offer changes the person's level does not allow, so only a device whose access was lowered while it edited offline, or a modified client, loses work this way.
- Being offline is a normal state. The UI shows it as a status ("Offline · saved locally"), never as an error. Connection loss is detected immediately from the browser's `offline` and `online` events, not left to a socket timeout, and the socket's close is completed on the device without waiting for a closing handshake that cannot finish without a network.

## Alternatives considered

- **Every device keeps the whole workspace.** Under Notion's access model ([ADR-NOTE-011](ADR-NOTE-011-access-control.md)) any page can be private or shared alone, so pages would reach people who must not see them.
- **An offline mode added to a server-first app**, which becomes a second code path that is rarely exercised and breaks easily.

## Evidence

- PR #1 ([`research/04-spike-findings.md`](../research/04-spike-findings.md)): the app starts with no network, offline edits merge with concurrent online edits, edits made while the server is down sync later, and a new device gets everything from the server.
- PR #2 ([`research/05-spike-2-findings.md`](../research/05-spike-2-findings.md)): conflicting offline page moves converge, and a 5,000-row database reloads offline in about 0.5 s.
- The access spike ([`research/07-access-spike-findings.md`](../research/07-access-spike-findings.md)), in `spikes/notes-access-sync-poc/`:
  - `e2e/tests/private-pages.spec.ts`, `e2e/tests/guests.spec.ts` and `server/testing/sync-boundary.test.ts`: each device holds exactly what its person can open.
  - `e2e/tests/losing-access.spec.ts` and `server/testing/losing-access.test.ts`: lost pages leave IndexedDB, online and on reconnecting after being offline, and come back when access returns; unsynced edits are offered as a new Private page; a removed person's device deletes the workspace's pages.
  - `e2e/tests/rejecting-edits.spec.ts`: a page at Can comment opens read-only, online and offline; a refused edit is dropped from memory and storage.
  - `e2e/tests/collaboration.spec.ts`: an offline edit still merges with another person's live edit.
  - `e2e/tests/access-scale.spec.ts`: the offline badge switches at once (it could stay "Synced" for about 36 s before the close was completed on the device).

## Consequences

- Storage and memory on each device grow with what its person can open, which is at most the whole workspace. That is acceptable at the scale set by [ADR-NOTE-004](ADR-NOTE-004-hosting-and-scale.md).
- Permissions are enforced when changes sync, not when they are made ([ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md)).
- A device that never syncs again keeps what it has. A removed person's device learns of the removal only if the server still answers it: the session must keep reaching the server long enough to be told "no access". Signing out or revoking a session stops syncing and leaves the data ([ADR-NOTE-009](ADR-NOTE-009-identity.md)).
- The offered copy of a lost page is the whole page, not only the unsynced edits, because a Yjs update cannot be split back into the server's part and the device's.
- A device keeps pages it created offline before the server has indexed them, so it reopens every document in its storage and lets the server's answer decide what is deleted.
- How docs are held in memory and stored on the device can still change (see "Not decided yet" in the [index](README.md)). The rule that every device holds everything its person can open does not.

## Changelog

- 2026-10-17: Each device keeps only what its person can open, instead of the whole workspace, and deletes a page at the next sync after its person loses access, instead of keeping it. Access now follows Notion's model ([ADR-NOTE-011](ADR-NOTE-011-access-control.md)), where any page can be private or shared alone, so whole-workspace sync would carry pages to people who must not see them. Refused changes are discarded and synced again, and the offline badge no longer waits on the socket's closing handshake. Evidence: the access spike ([`research/07-access-spike-findings.md`](../research/07-access-spike-findings.md), PR #23). It was first recorded as a separate ADR, since merged in here.
- 2026-10-16: Accepted. Every device kept the whole workspace, so any page opened offline, and data stayed on a device even after it lost access. Evidence: PR #1 and PR #2.
