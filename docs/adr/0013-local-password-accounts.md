# 13. Local accounts with passwords

- Status: Accepted
- Date: 2026-10-16

## Context
Each instance needs to know who is editing (ADR 12). A homelab install shouldn't depend on an external identity provider or proxy.

## Decision
- LocalNotion manages its own **accounts, signed in with username and password**. There's no external identity provider, trusted-header sign-in or passkeys.
- On first run, the instance owner creates the admin account. After that, an admin creates accounts or invites people. There's no public sign-up.
- Passwords are hashed with a memory-hard function from Node's built-in crypto (`scrypt`), in line with ADR 5 (no native dependencies). An admin can reset a forgotten password.
- Signing in on a new device needs the server once. The device then keeps a **long-lived session**, so the app opens and works offline without asking for the password again. The server checks the session whenever the device syncs.
- Signing out, or an admin revoking a session, stops that device from syncing. Data already on the device stays there (see ADR 12).

## Consequences
- The server stores account and session data alongside the documents in its SQLite database (ADR 6).
- Login attempts need rate limiting, because an instance may be reachable beyond the LAN.
