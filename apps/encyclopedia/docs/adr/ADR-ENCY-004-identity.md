# ADR-ENCY-004. How does the app know who is reading?

- Status: Accepted
- Date: 2026-10-18
- Depends on: [ADR-ENCY-001](ADR-ENCY-001-content-source.md), [ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)
- Dependency of: [ADR-ENCY-005](ADR-ENCY-005-offline-use.md)

## Context

Saved lists belong to a person, and only the homelab admin should change which Wikipedia an install holds. Every homelab app signs people in through one homelab account ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)), and the homelab admin decides, person by person, which apps each can use and at what level when inviting them.

## Decision

- **People sign in with their homelab account** through VoidAuth, like every homelab app ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)). Encyclopedia has no sign-in of its own, and nobody reads without signing in.
- **Who may use Encyclopedia is what the admin granted when inviting them.** Encyclopedia adds no access rules of its own.
- **Only the homelab admin changes the content settings** ([ADR-ENCY-001](ADR-ENCY-001-content-source.md)). Every other person who has access reads, searches and keeps saved lists.
- **A person is identified by VoidAuth's `sub`,** never by email, and their saved lists are keyed by it.
- **A device stays signed in** across restarts and while offline, so saved articles open with no network.

## Evidence

- Platform sign-in decision and the VoidAuth spike: [ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md).
- Christian, 2026-10-18, in the project thread: access to any app is set by the admin when inviting someone.

## Consequences

- Encyclopedia follows the platform's account and invite work. It has no people screens of its own.
- Public reading without an account is ruled out. Offering it later would need a new decision.
