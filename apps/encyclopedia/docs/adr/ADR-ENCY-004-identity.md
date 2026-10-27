# ADR-ENCY-004. How does the app know who is reading?

- Status: Accepted
- Date: 2026-10-23
- Depends on: [ADR-ENCY-001](ADR-ENCY-001-content-source.md), [ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)
- Dependency of: [ADR-ENCY-005](ADR-ENCY-005-offline-use.md)

## Context

Saved lists belong to a person, and only the admin should change which Wikipedia an install holds. Every app signs people in through one homelab account, and the homelab admin sets each person's apps and levels when inviting them ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)).

## Decision

- **Homelab account sign-in at the gateway** ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)); no sign-in of its own, no reading signed out.
- **Access = App access**: member (`encyclopedia` in `Remote-Groups`) or admin (`encyclopedia-admins`); no rules of its own.
- **Only admin-level App access changes content settings** ([ADR-ENCY-001](ADR-ENCY-001-content-source.md)); members read, search and keep lists. Being a homelab admin gives nothing here by itself.
- **Identified by account id** (`Remote-User`), never email or name; saved lists are keyed by it.
- **Devices stay signed in** across restarts and offline, so saved articles open with no network.
- **Sign-out is the App switcher's**, atop every page, which also leads to other apps ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)).

## Evidence

- [ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md) and the accounts service's tests.
- Christian, 2026-10-18, project thread: the admin sets app access when inviting.
- `platform/e2e/`: switcher on the title page with Encyclopedia **Current**; its Sign out signs out every app (PR for #90).

## Consequences

- Follows the platform's account and invite work; no people screens of its own.
- No public reading without an account; that would need a new decision.
- The title page opens from the service worker without checking sign-in (it holds nothing private), so after sign-out it still opens, without the user icon, until reading exists and the app checks the person online before showing kept data.

## Changelog

- 2026-10-23: Identified by account id from the homelab's own accounts service, not a VoidAuth username; content settings belong to admin-level App access, since a homelab admin's flag no longer reaches apps. Accounts service replaced VoidAuth ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md), issue #111, spec #110).
- 2026-10-23: The App switcher is the gateway's tab atop every page, not an element in the title page's header; Encyclopedia carries nothing for it (issue #104, spec #101).
- 2026-10-22: Title page header holds the App switcher for sign-out and other apps; before, there was no way to sign out or leave (issue #90, spec #75).
- 2026-10-19: Identified by VoidAuth username from the gateway's headers, not VoidAuth's `sub`; access granted through VoidAuth groups. Every app now sits behind one gateway asking VoidAuth about each request ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)).
- 2026-10-18: Accepted. Homelab account sign-in through VoidAuth, identified by VoidAuth's `sub`.
