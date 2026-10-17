# ADR-NOTE-009. How does an instance know who is editing?

- Status: Accepted
- Date: 2026-10-16
- Depends on: [ADR-NOTE-004](ADR-NOTE-004-hosting-and-scale.md), [ADR-NOTE-005](ADR-NOTE-005-document-persistence.md), [ADR-PLAT-001](../../../../docs/adr/ADR-PLAT-001-toolchain.md)
- Dependency of: [ADR-NOTE-001](ADR-NOTE-001-offline-use.md), [ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md), [ADR-NOTE-011](ADR-NOTE-011-access-control.md), [ADR-NOTE-013](ADR-NOTE-013-data-layout.md), [ADR-NOTE-014](ADR-NOTE-014-http-and-accounts.md)

## Context
Each instance needs to know who is editing. A homelab install ([ADR-NOTE-004](ADR-NOTE-004-hosting-and-scale.md)) should not depend on an external identity provider or proxy, and the app must keep working offline after sign-in ([ADR-NOTE-001](ADR-NOTE-001-offline-use.md)).

## Decision
- LocalNotion manages its own **accounts, signed in with username and password**.
- On first run, the instance owner creates the admin account. After that, an admin creates accounts or invites people. There is no public sign-up.
- Passwords are hashed with `scrypt`, a memory-hard function in Node's built-in crypto, so no native dependency is needed ([ADR-PLAT-001](../../../../docs/adr/ADR-PLAT-001-toolchain.md)). An admin can reset a forgotten password.
- Signing in on a new device needs the server once. The device then keeps a **long-lived session**, so the app opens and works offline without asking for the password again. The server checks the session whenever the device syncs.
- Signing out, or an admin revoking a session, stops that device from syncing. Data already on the device stays there ([ADR-NOTE-001](ADR-NOTE-001-offline-use.md)).

## Alternatives considered
- **An external identity provider, trusted-header sign-in or passkeys.** A homelab install should not depend on an external identity provider or proxy.

## Evidence
- None yet from a spike. The decision follows from the stated requirements ([`research/02-requirements.md`](../research/02-requirements.md)) and the choices made in the ADR review for PR #2.

## Consequences
- The server stores account and session data alongside the documents in its SQLite database ([ADR-NOTE-005](ADR-NOTE-005-document-persistence.md)).
- Login attempts need rate limiting, because an instance may be reachable beyond the LAN.
- The sync server checks the session on each connection ([ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md)).
