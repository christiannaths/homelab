# 11. How do people sign in?

- Status: Accepted
- Date: 2026-10-16
- Depends on: [ADR 4](0004-hosting-and-scale.md), [ADR 5](../../../../docs/adr/0005-language-and-runtime.md), [ADR 6](0006-server-storage.md)
- Dependency of: [ADR 1](0001-offline-use.md), [ADR 12](0012-sync-server.md), [ADR 13](0013-access-model.md), [ADR 17](0017-document-layout.md), [ADR 18](0018-http-and-accounts.md)

## Context
Each instance needs to know who is editing. A homelab install ([ADR 4](0004-hosting-and-scale.md)) should not depend on an external identity provider or proxy, and the app must keep working offline after sign-in ([ADR 1](0001-offline-use.md)).

## Decision
- LocalNotion manages its own **accounts, signed in with username and password**. There is no external identity provider, trusted-header sign-in or passkeys.
- On first run, the instance owner creates the admin account. After that, an admin creates accounts or invites people. There is no public sign-up.
- Passwords are hashed with `scrypt`, a memory-hard function in Node's built-in crypto, so no native dependency is needed ([ADR 5](../../../../docs/adr/0005-language-and-runtime.md)). An admin can reset a forgotten password.
- Signing in on a new device needs the server once. The device then keeps a **long-lived session**, so the app opens and works offline without asking for the password again. The server checks the session whenever the device syncs.
- Signing out, or an admin revoking a session, stops that device from syncing. Data already on the device stays there ([ADR 1](0001-offline-use.md)).

## Evidence
- None yet from a spike. The decision follows from the stated requirements ([`research/02-requirements.md`](../research/02-requirements.md)) and the choices made in the ADR review for PR #2.

## Consequences
- The server stores account and session data alongside the documents in its SQLite database ([ADR 6](0006-server-storage.md)).
- Login attempts need rate limiting, because an instance may be reachable beyond the LAN.
- The sync server checks the session on each connection ([ADR 12](0012-sync-server.md)).
