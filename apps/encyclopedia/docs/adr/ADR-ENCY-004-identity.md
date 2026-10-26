# ADR-ENCY-004. How does the app know who is reading?

- Status: Accepted
- Date: 2026-10-23
- Depends on: [ADR-ENCY-001](ADR-ENCY-001-content-source.md), [ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)
- Dependency of: [ADR-ENCY-005](ADR-ENCY-005-offline-use.md)

## Context

Saved lists belong to a person, and only the homelab admin should change which Wikipedia an install holds. Every homelab app signs people in through one homelab account ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)), and the homelab admin decides, person by person, which apps each can use and at what level when inviting them.

## Decision

- **People sign in with their homelab account** at the homelab gateway, like every homelab app ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)). Encyclopedia has no sign-in of its own, and nobody reads without signing in.
- **Who may use Encyclopedia is their App access to it**, at member level (`encyclopedia` in `Remote-Groups`) or admin level (`encyclopedia-admins`). Encyclopedia adds no access rules of its own.
- **Only a person with admin-level App access changes the content settings** ([ADR-ENCY-001](ADR-ENCY-001-content-source.md)). Every other person who has access reads, searches and keeps saved lists. Being a homelab admin gives nothing in Encyclopedia by itself.
- **A person is identified by their account id** (`Remote-User`), never by email or name, which can change, and their saved lists are keyed by it.
- **A device stays signed in** across restarts and while offline, so saved articles open with no network.
- **Signing out is the App switcher's**, at the top of every Encyclopedia page, as in every homelab app ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)). The same menu leads to the reader's other apps. Encyclopedia has no sign-out of its own.

## Evidence

- Platform sign-in decision and the accounts service's tests: [ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md).
- Christian, 2026-10-18, in the project thread: access to any app is set by the admin when inviting someone.
- The platform's end-to-end suite (`platform/e2e/`): the App switcher shows on the title page with Encyclopedia marked as current, and its Sign out signs out every app (PR for issue #90).

## Consequences

- Encyclopedia follows the platform's account and invite work. It has no people screens of its own.
- Public reading without an account is ruled out. Offering it later would need a new decision.
- The title page opens from the service worker without asking whether the browser is still signed in, since it holds nothing private. After a sign-out it still opens, without the user icon, until reading is built and the app checks the person online before showing what it kept.

## Changelog

- 2026-10-23: A person is identified by their account id from the homelab's own accounts service instead of a VoidAuth username, and the content settings belong to people with admin-level App access to Encyclopedia, since a homelab admin's flag no longer reaches apps. The accounts service replaced VoidAuth ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md), issue #111, spec #110).
- 2026-10-23: The App switcher is the tab the gateway adds at the top of every page, instead of an element in the title page's header, so the Encyclopedia carries nothing for it (issue #104, spec #101).
- 2026-10-22: The title page has a header holding the App switcher, which is how a reader signs out and reaches their other apps. Before it, Encyclopedia had no way to sign out or leave (issue #90, spec #75).
- 2026-10-19: A person is identified by their VoidAuth username, read from the homelab gateway's headers, instead of VoidAuth's `sub`, and the admin grants Encyclopedia through VoidAuth groups. Every homelab app now sits behind one gateway that asks VoidAuth about each request ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)).
- 2026-10-18: Accepted. People signed in with their homelab account through VoidAuth, identified by VoidAuth's `sub`.
