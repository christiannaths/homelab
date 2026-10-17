# ADR-NOTE-009. How does an instance know who is editing?

- Status: Accepted
- Date: 2026-10-17
- Depends on: [ADR-NOTE-004](ADR-NOTE-004-hosting-and-scale.md), [ADR-NOTE-005](ADR-NOTE-005-document-persistence.md), [ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)
- Dependency of: [ADR-NOTE-001](ADR-NOTE-001-offline-use.md), [ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md), [ADR-NOTE-011](ADR-NOTE-011-access-control.md), [ADR-NOTE-013](ADR-NOTE-013-data-layout.md), [ADR-NOTE-014](ADR-NOTE-014-http-and-accounts.md)

## Context
Each instance needs to know who is editing. The homelab's apps share one sign-in, with registration by invite only ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)). The app must keep working offline after sign-in ([ADR-NOTE-001](ADR-NOTE-001-offline-use.md)), and an instance may be reachable from the internet.

## Decision
- **People sign in through the homelab's VoidAuth** ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)). Notes has no passwords of its own.
- **Notes keeps its own list of people**, keyed by VoidAuth's `sub`, with each person's workspace role. Signing in to VoidAuth admits no one to Notes by itself.
- **The first VoidAuth admin to sign in becomes the first workspace owner.** After that, people join only through a Notes invite link, which records the role or page access it grants and works once.
- **Each device has its own session,** held in an `HttpOnly` cookie and stored with the documents ([ADR-NOTE-005](ADR-NOTE-005-document-persistence.md)). It lasts **a year and is extended on use**, matching VoidAuth's own sign-in.
- Signing in on a new device needs the server and VoidAuth once. The device then opens and works offline without signing in again. The server checks the session whenever the device syncs.
- Signing out, an owner revoking a device, or removing a person stops their devices from syncing. Data already on the device stays there ([ADR-NOTE-001](ADR-NOTE-001-offline-use.md)).

## Alternatives considered
- **Local password accounts in Notes, on Better Auth,** with sessions lasting a year. Each app would own password security, and a person would have one password per app ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)).
- **Sessions ending after 30 days without use.** A lost device would stop syncing sooner, but a device left unused for a month would have to sign in again. Revoking a device already stops a lost one at once.

## Evidence
- The VoidAuth spike ([`spikes/voidauth-sso-poc/FINDINGS.md`](../../../../spikes/voidauth-sso-poc/FINDINGS.md)): a stand-in Notes server signs people in through VoidAuth, sets its own device cookie that renews on sync, refuses the sync socket without it, and keeps syncing while VoidAuth is stopped.
- The server stack spike ([`research/09-server-stack-spike-findings.md`](../research/09-server-stack-spike-findings.md)): closing a session's open sockets on revocation, with code 4401, and renewing the cookie over HTTP.

## Consequences
- A device unused for more than a year still opens with its data offline, but signs in again before it syncs.
- A removed person's device learns of the removal only if the server answers it with "no access" ([ADR-NOTE-001](ADR-NOTE-001-offline-use.md)). Removing a person must tell their connected devices before ending their sessions.
- Password resets, password rules and sign-in rate limiting belong to VoidAuth.
- The sync server checks the session on each connection ([ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md)).

## Changelog
- 2026-10-17: People sign in through the homelab's VoidAuth instead of Notes' own password accounts, and each device keeps its own session, lasting a year and extended on use. The homelab moved to one sign-in for every app with registration by invite only ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)).
- 2026-10-16: Accepted. Notes managed its own username and password accounts, hashed with `scrypt`, with admin-created accounts and long-lived device sessions.
