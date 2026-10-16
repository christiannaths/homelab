# 12. Users sign in with local password accounts

- Status: Accepted
- Date: 2026-10-16
- Depends on: [ADR 1](0001-device-is-source-of-truth.md), [ADR 4](0004-homelab-instance.md), [ADR 5](0005-typescript-node-26-npm.md), [ADR 6](0006-sqlite-server-storage.md)
- Dependency of: [ADR 13](0013-hocuspocus-sync-server.md)

## Context
Each instance needs to know who is editing. A homelab install ([ADR 4](0004-homelab-instance.md)) should not depend on an external identity provider or proxy, and the app must keep working offline after sign-in ([ADR 1](0001-device-is-source-of-truth.md)).

## Decision
- LocalNotion manages its own **accounts, signed in with username and password**. There is no external identity provider, trusted-header sign-in or passkeys.
- On first run, the instance owner creates the admin account. After that, an admin creates accounts or invites people. There is no public sign-up.
- Passwords are hashed with `scrypt`, a memory-hard function in Node's built-in crypto, so no native dependency is needed ([ADR 5](0005-typescript-node-26-npm.md)). An admin can reset a forgotten password.
- Signing in on a new device needs the server once. The device then keeps a **long-lived session**, so the app opens and works offline without asking for the password again. The server checks the session whenever the device syncs.
- Signing out, or an admin revoking a session, stops that device from syncing. Data already on the device stays there ([ADR 1](0001-device-is-source-of-truth.md)).

## Evidence
- None yet from a spike. The decision follows from the stated requirements (`research/02-requirements.md`) and the choices made in the ADR review for PR #2.

## Consequences
- The server stores account and session data alongside the documents in its SQLite database ([ADR 6](0006-sqlite-server-storage.md)).
- Login attempts need rate limiting, because an instance may be reachable beyond the LAN.
- The sync server checks the session on each connection ([ADR 13](0013-hocuspocus-sync-server.md)).
