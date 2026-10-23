# ADR-NOTE-009. How does an instance know who is editing?

- Status: Accepted
- Date: 2026-10-22
- Depends on: [ADR-NOTE-004](ADR-NOTE-004-hosting-and-scale.md), [ADR-NOTE-005](ADR-NOTE-005-document-persistence.md), [ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)
- Dependency of: [ADR-NOTE-001](ADR-NOTE-001-offline-use.md), [ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md), [ADR-NOTE-011](ADR-NOTE-011-access-control.md), [ADR-NOTE-013](ADR-NOTE-013-data-layout.md), [ADR-NOTE-014](ADR-NOTE-014-http-and-accounts.md)

## Context

Each instance needs to know who is editing. The homelab's apps share one homelab account behind one gateway, and the homelab admin grants each app, with a level, through VoidAuth groups ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)). The app must keep working offline after sign-in ([ADR-NOTE-001](ADR-NOTE-001-offline-use.md)), and an instance may be reachable from the internet.

## Decision

- **People sign in with their homelab account at the gateway** ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)). Notes has no passwords, sign-in flow or sessions of its own: every request it receives carries the person in the gateway's `Remote-*` headers.
- **Who may use Notes is the admin's grant in VoidAuth.** The `notes` group lets a person in, and `notes-admins` lets them in as an owner. Members of `auth_admins` are owners too. VoidAuth refuses everyone else before the request reaches Notes.
- **Notes keeps its own list of people**, keyed by VoidAuth username, with each person's name and role. A person is added on their first request, and their name and role follow VoidAuth's on every request.
- Signing in on a new device needs the server and VoidAuth once. The device then opens offline with what it kept, without signing in again. It asks the server who is signed in whenever it starts online or reconnects, before it shows anything it kept.
- **Notes has no sign-out of its own.** Signing out is the App switcher's Sign out at the top of Notes, the same in every app, which goes to VoidAuth's sign-out page and signs the browser out of every homelab app ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)). Signing out needs a connection. Data already on the device stays there ([ADR-NOTE-001](ADR-NOTE-001-offline-use.md)), and the next online start, finding the browser signed out, forgets the person and goes to sign in.

## Alternatives considered

- **Notes as an OIDC client of VoidAuth, with year-long device sessions of its own.** Built first (PR #66). A sign-out made in VoidAuth or another app could not reach Notes, because VoidAuth's back-channel logout refuses homelab addresses ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)).
- **Local password accounts in Notes, on Better Auth.** Each app would own password security, and a person would have one password per app.

## Evidence

- The ProxyAuth spike ([`spikes/voidauth-proxyauth-poc/FINDINGS.md`](../../../../spikes/voidauth-proxyauth-poc/FINDINGS.md), PR #68): a stand-in Notes reads the person from the gateway's headers, its levels come from `notes` and `notes-admins`, and one sign-out signs it and the Encyclopedia out.
- Notes' end-to-end suite (`apps/notes/e2e/`): the real Notes server and web client behind Caddy and VoidAuth 1.16.0 in Chromium, covering sign-in, owners and members, signing out on VoidAuth's page, and starting offline. Home's end-to-end suite (`apps/home/e2e/`) signs out from the App switcher in Notes and checks that Home and the Encyclopedia are signed out too.

## Consequences

- An admin renaming a username in VoidAuth makes that person new to Notes.
- Removing someone from `notes` stops their next request, sync included. A device that is offline keeps what it has until it is next online ([ADR-NOTE-001](ADR-NOTE-001-offline-use.md)).
- A device opened offline after a sign-out shows what it kept until it is next online, since it cannot ask whether the browser is still signed in.
- An open sync socket is not closed by a sign-out elsewhere: the gateway checks the person only when the socket opens. The device learns of the sign-out when it reconnects or next asks the server who is signed in.
- The roles here are the instance's people. Workspaces with members of their own come with the access work ([ADR-NOTE-011](ADR-NOTE-011-access-control.md)).
- Password resets, password rules and sign-in rate limiting belong to VoidAuth.
- The sync server reads the person on each connection ([ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md)).

## Changelog

- 2026-10-22: Notes' own Sign out button, its offline sign-out (signing out on the device at once and finishing on the next online start) and its `/api/sign-out` route are removed, and signing out is the App switcher's, as in every app. One sign-out in one place in every app is simpler than each app having its own (issue #89, spec #75).
- 2026-10-19: Notes reads the person from the homelab gateway's headers, and its people and roles follow the admin's VoidAuth groups, instead of signing people in as an OIDC client with its own year-long device sessions and admitting only the first VoidAuth admin. As an OIDC client, Notes could not learn of a sign-out made elsewhere ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md), PR #68).
- 2026-10-17: People signed in through the homelab's VoidAuth instead of Notes' own password accounts, and each device kept its own session, lasting a year and extended on use. The homelab moved to one sign-in for every app with registration by invite only ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)).
- 2026-10-16: Accepted. Notes managed its own username and password accounts, hashed with `scrypt`, with admin-created accounts and long-lived device sessions.
