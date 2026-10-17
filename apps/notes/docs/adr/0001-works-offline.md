# 1. The app works fully offline

- Status: Superseded by [ADR 18](0018-works-offline-on-what-its-person-can-open.md)
- Date: 2026-10-16
- Depends on: [ADR 4](0004-homelab-instance.md)
- Dependency of: [ADR 2](0002-yjs-stores-shared-data.md), [ADR 3](0003-pwa-client.md), [ADR 11](0011-local-password-accounts.md), [ADR 12](0012-hocuspocus-sync-server.md)

## Context
Full offline support is a core requirement. An offline mode added to a server-first app becomes a second code path that is rarely exercised and breaks easily.

## Decision
- **Every read and write goes to the local copy first.** The UI never waits on the network to show or change anything.
- The network is used only to exchange changes with other devices. The server is one more participant that relays and backs up changes, and never has to approve an edit before it appears.
- **Each device keeps the whole workspace**, not only the pages it has opened. Any page opens offline, including one the device has never opened before.
- Being offline is a normal state. The UI shows it as a status ("Offline · saved locally"), never as an error. Connection loss is detected immediately from the browser's `offline` and `online` events, not left to a socket timeout.

## Evidence
- PR #1 ([`research/04-spike-findings.md`](../research/04-spike-findings.md)):
  - The app starts with no network.
  - Offline edits merge with concurrent online edits.
  - Edits made while the server is down sync later.
  - A new device gets everything from the server; 501 docs sync in about 1.3 s.
- PR #2 ([`research/05-spike-2-findings.md`](../research/05-spike-2-findings.md)):
  - Conflicting offline page moves converge.
  - Row bodies are available offline on a second device.
  - A 5,000-row database reloads offline in about 0.5 s.

## Consequences
- Storage on each device grows with the whole workspace. That is acceptable at the scale set by [ADR 4](0004-homelab-instance.md).
- Permissions are enforced when changes sync, not when they are made ([ADR 11](0011-local-password-accounts.md), [ADR 12](0012-hocuspocus-sync-server.md)).
- Data that has reached a device stays on it, even after that device loses access.
- How docs are held in memory and stored on the device can still change (see "Not decided yet" in the [index](README.md)). The rule that every device holds everything does not.
