# 1. Local-first: the device holds the real data, the server is a relay and backup

- Status: Accepted
- Date: 2026-10-16

## Context
Full offline support is a core requirement. A "works offline" mode bolted onto a server-first app turns into a second code path that's rarely exercised and breaks easily.

## Decision
- **Every read and write goes to the local copy first.** The UI never waits on the network to show or change anything.
- The network is used only to exchange changes with other devices. The server is one more participant that relays and backs up changes. It never has to approve an edit before it appears.
- **Each device keeps the whole workspace**, not just the pages it has opened: every page, every database, and every database row that has a body. Any page can be opened offline, even one this device has never opened.
- Being offline is a normal state. It shows in the UI as a status ("Offline · saved locally") and never as an error. Connection loss is detected immediately from the browser's `offline`/`online` events, not left to a socket timeout.

## Evidence
- PR #1, `research/04-spike-findings.md`:
  - the app cold-starts with no network
  - offline edits merge with concurrent online edits
  - edits made while the server is down sync later
  - a new device gets everything from the server
- Whole-workspace sync of 501 docs completes in ~1.3 s on a new device.
- PR #2, `research/05-spike-2-findings.md`:
  - conflicting offline moves converge
  - row bodies are available offline on a second device
  - a 5,000-row database reloads offline in ~0.5 s

## Consequences
- Storage on each device grows with the whole workspace. That's acceptable at homelab scale (ADR 4).
- Permissions are enforced when changes sync, not when they're made (ADRs 12, 13 and 15).
- How docs are held in memory and stored on the device can change (see "Not decided yet"), but the rule that every device holds everything does not.
