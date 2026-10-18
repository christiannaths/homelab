# ADR-PLAT-004. How do people sign in to the homelab's apps?

- Status: Accepted
- Date: 2026-10-17
- Depends on: [ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)
- Dependency of: [ADR-NOTE-004](../../apps/notes/docs/adr/ADR-NOTE-004-hosting-and-scale.md), [ADR-NOTE-009](../../apps/notes/docs/adr/ADR-NOTE-009-identity.md), [ADR-NOTE-014](../../apps/notes/docs/adr/ADR-NOTE-014-http-and-accounts.md)

## Context

The homelab runs several apps for the same few people, on a home server reachable from the internet behind a reverse proxy that terminates HTTPS. Each app needs to know who is using it. Passwords, password resets, rate limiting and session revocation are security-sensitive code that no app should have to own on its own, and a person should have one account for every app. Only people already in should be able to bring someone new in: registration is closed, and an invite link from a member is the only way to create an account.

## Decision

- **VoidAuth is the one sign-in for every app.** It is an OpenID Connect provider, run from its official image, unmodified and pinned by version and digest, on SQLite. The repo contains none of its code (it is AGPL-3.0).
- **VoidAuth and the invite service form one app, `apps/accounts/`** ([ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)), with VoidAuth's compose setup and the invite service as its packages.
- **Each app is an OIDC client** (authorization code with PKCE). It identifies a person by VoidAuth's `sub`, never by email, and keeps its own members, roles and device sessions. A VoidAuth account grants nothing in any app by itself.
- **Registration is closed** (`SIGNUP=false`). An account is created only through a VoidAuth invite link, and each link works once.
- **The invite service** is the only holder of VoidAuth's admin credentials:
  - It offers apps one action: create an invite link. It never deletes, changes or lists accounts.
  - It is reachable only on the internal network, and each app calls it with its own key.
  - The app decides who may invite and records what the link grants. When the newcomer signs in for the first time, the app admits them at that level.
- **The instance admin is a VoidAuth admin.** Apps read VoidAuth's `groups` claim (the `groups` scope), and the first member of `auth_admins` to sign in to an app becomes its first owner.
- **Production settings:** `TRUSTED_PROXIES` is the reverse proxy's address, and VoidAuth's port is not published, so only the proxy reaches it.

## Alternatives considered

- **Each app manages its own accounts,** as Notes first planned with Better Auth. Every app would own password and session security, and a person would have one password per app.
- **Open VoidAuth sign-up, with each app's own one-time links.** It needs no admin credentials, but anyone who can reach VoidAuth can create an account, and closed registration is a requirement.
- **Each app holds VoidAuth's admin credentials** to create invites. VoidAuth's admin rights cannot be narrowed, so every app could also delete accounts.
- **An `accounts` app built on `oidc-provider`.** It means writing and maintaining the security-sensitive code VoidAuth already provides.
- **Authelia.** It has no invites or self-registration: its users live in a file or an LDAP directory that the admin edits.

## Evidence

- The VoidAuth spike ([`spikes/voidauth-sso-poc/FINDINGS.md`](../../spikes/voidauth-sso-poc/FINDINGS.md), issue #35, PR #36): 33 end-to-end tests against VoidAuth 1.16.0's official image pass. They cover:
  - an admin session creating a VoidAuth invite link that works once, and non-admins and app tokens being refused
  - the `groups` claim telling admins apart, and the first admin becoming an app's first owner
  - an app's own device session and sync continuing while VoidAuth is stopped
  - rate limiting behind a proxy, which needs `TRUSTED_PROXIES` set to the proxy's address
- The spike created invites with sign-up open. Invite links with sign-up off, and the invite service itself, are not tested yet.
- Memory: 285 MiB after start and 404 MiB after the suite, measured with `docker stats`.

## Consequences

- VoidAuth has no API tokens, so the invite service signs in as an admin the way VoidAuth's web interface does. That interface is not a stable API: each VoidAuth upgrade is tested against the invite service before it is taken.
- VoidAuth must be running for anyone to sign in on a new device. Devices already signed in to an app keep working while it is down.
- Password resets, password rules and sign-in rate limiting belong to VoidAuth. An app has no password screens.
- Without email configured, VoidAuth does not verify addresses, which is why apps never match people by email.
- The homelab runs one more container for VoidAuth and one for the invite service.
- Not yet tested: a real browser, real HTTPS behind Caddy or another proxy, and VoidAuth upgrades.
