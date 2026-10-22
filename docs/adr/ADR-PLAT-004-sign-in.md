# ADR-PLAT-004. How do people sign in to the homelab's apps?

- Status: Accepted
- Date: 2026-10-19
- Depends on: [ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)
- Dependency of: [ADR-ENCY-004](../../apps/encyclopedia/docs/adr/ADR-ENCY-004-identity.md), [ADR-NOTE-004](../../apps/notes/docs/adr/ADR-NOTE-004-hosting-and-scale.md), [ADR-NOTE-009](../../apps/notes/docs/adr/ADR-NOTE-009-identity.md), [ADR-NOTE-014](../../apps/notes/docs/adr/ADR-NOTE-014-http-and-accounts.md), [ADR-PLAT-008](ADR-PLAT-008-work-previews.md)

## Context

The homelab runs several apps for the same few people, on a home server reachable from the internet behind a reverse proxy that terminates HTTPS. Signing in should work like a Google account: one homelab account, one sign-in for every app, and one sign-out that signs the browser out of every app at once. The homelab admin decides, person by person, which apps each person can use and at what level. Passwords, password resets, rate limiting and session revocation are security-sensitive code that no app should have to own on its own. Only people already in should be able to bring someone new in: registration is closed, and an invite link is the only way to create an account.

## Decision

- **VoidAuth holds the homelab account.** It runs from its official image, unmodified and pinned by version and digest, on SQLite. The repo contains none of its code (it is AGPL-3.0).
- **Every app sits behind one gateway that asks VoidAuth about each request** (VoidAuth's ProxyAuth, through the gateway's forward auth):
  - All apps are hosted under one parent domain (`notes.home.example`, `auth.home.example`). VoidAuth's session cookie is set on that domain (`SESSION_DOMAIN`), so one sign-in covers every app and one sign-out ends it for all of them.
  - Before passing a request on, the gateway sends it to VoidAuth's `/api/authz/forward-auth`. VoidAuth answers with the person in `Remote-User`, `Remote-Name`, `Remote-Email` and `Remote-Groups`, or sends the browser to its sign-in page or its "forbidden" page.
  - The gateway must delete any `Remote-*` headers the browser sent before asking VoidAuth, because VoidAuth leaves out the headers it has no value for.
  - Only the gateway reaches the apps: no app publishes a port of its own.
  - The gateway is Caddy, set up as in [`spikes/voidauth-proxyauth-poc/gateway/gateway.caddyfile`](../../spikes/voidauth-proxyauth-poc/gateway/gateway.caddyfile).
- **Apps have no sign-in code.** An app reads the person from the gateway's headers on each request and keeps no session of its own. It identifies a person by their VoidAuth username (`Remote-User`), never by email.
- **The homelab admin grants apps through VoidAuth groups:**
  - Each app is a ProxyAuth domain in VoidAuth (`notes.home.example/*`), open to two groups: `<app>` lets a person in, and `<app>-admins` lets them in as the app's admin.
  - VoidAuth refuses everyone else before the request reaches the app, and members of `auth_admins` reach every app.
  - The app decides what its levels mean, from `Remote-Groups`.
- **Signing out is VoidAuth's `/logout` page.** An app's sign-out sends the browser there. After the person confirms, every app in that browser is signed out on its next request, and other browsers stay signed in.
- **Registration is closed** (`SIGNUP=false`). An account is created only through a VoidAuth invite link, and each link works once. The invite carries the groups, and so the apps, the admin grants.
- **VoidAuth and the invite service form one app, `apps/accounts/`** ([ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)), with VoidAuth's compose setup and the invite service as its packages.
- **The invite service** is the only holder of VoidAuth's admin credentials:
  - It offers apps one action: create an invite link. It never deletes, changes or lists accounts.
  - It is reachable only on the internal network, and each app calls it with its own key.
- **Production settings:** `TRUSTED_PROXIES` is the gateway's address, and VoidAuth's port is not published, so only the gateway reaches it.

## Alternatives considered

- **Each app as an OIDC client of VoidAuth, with its own device sessions.** Notes was built this way first (PR #66). Signing out elsewhere could not reach the apps: VoidAuth's back-channel logout refuses every private, loopback and CGNAT address, which is every homelab address, and its logout tokens carry no session id.
- **Each app manages its own accounts,** as Notes first planned with Better Auth. Every app would own password and session security, and a person would have one password per app.
- **Authentik.** It meets every goal, including back-channel sign-out, but needs Postgres, a server and a worker, around 2 GB of memory in practice ([`auth-provider-comparison.md`](../research/auth-provider-comparison.md)).
- **Authelia.** It has no invites or admin pages for people: its users live in a file or an LDAP directory that the admin edits.
- **An account service of our own, on Better Auth.** It is the fallback if VoidAuth stops meeting these goals; until then it means writing security-sensitive code VoidAuth already provides ([`build-own-sign-in.md`](../research/build-own-sign-in.md)).
- **Open VoidAuth sign-up, with each app's own one-time links.** It needs no admin credentials, but anyone who can reach VoidAuth can create an account, and closed registration is a requirement.
- **Each app holds VoidAuth's admin credentials** to create invites. VoidAuth's admin rights cannot be narrowed, so every app could also delete accounts.

## Evidence

- The ProxyAuth spike ([`spikes/voidauth-proxyauth-poc/FINDINGS.md`](../../spikes/voidauth-proxyauth-poc/FINDINGS.md), PR #68): 9 tests in Chromium through Caddy 2.10.2 and VoidAuth 1.16.0 pass. They cover:
  - one sign-in opening every app the admin granted, and a refusal from an app outside the person's groups
  - removing a person from a group taking effect on their next request
  - one sign-out signing every app in that browser out, and no other browser
  - a forged `Remote-*` header reaching the app with VoidAuth's documented Caddy setup, and being stopped by deleting those headers first
  - an offline-first app's service worker and WebSocket through the gateway
- The VoidAuth spike ([`spikes/voidauth-sso-poc/FINDINGS.md`](../../spikes/voidauth-sso-poc/FINDINGS.md), issue #35, PR #36): invite links that work once, and rate limiting behind a proxy, which needs `TRUSTED_PROXIES`.
- PR #66: Notes as an OIDC client in a real browser, and VoidAuth's back-channel logout never reaching a homelab address.
- Memory: 285 MiB after start and 404 MiB after the VoidAuth spike's suite, measured with `docker stats`.

## Consequences

- An app trusts whoever sends it the headers, so it must never be reachable except through the gateway. Its tests send the headers themselves.
- Adding an app means a site in the gateway and a ProxyAuth domain with its two groups in VoidAuth. A hostname without a ProxyAuth domain is refused, but a ProxyAuth domain without groups lets in every signed-in person.
- VoidAuth's admin pages can rename a username, and an app then sees a new person. Admins must not rename people.
- VoidAuth must be running for any app request to succeed, including on devices already signed in. An offline-first app keeps working from what it kept on the device.
- An app learns of a sign-out on its next request. An open WebSocket stays open until it reconnects, and an app opened offline shows what it kept until it is next online.
- After signing out, VoidAuth sends the browser to one address for all apps (`DEFAULT_REDIRECT`), not back to the app the person came from. Its "Do you want to log out?" question cannot be skipped.
- Only browsers can use the apps: without a cookie, VoidAuth accepts only a username and password in `Authorization`, and it has no tokens for other clients.
- VoidAuth has no API tokens, so the invite service signs in as an admin the way VoidAuth's web interface does. That interface is not a stable API: each VoidAuth upgrade is tested against the invite service before it is taken.
- Password resets, password rules and sign-in rate limiting belong to VoidAuth. An app has no password screens.
- Not yet tested: Traefik or nginx as the gateway, real certificates, passkeys and MFA, and VoidAuth upgrades.

## Changelog

- 2026-10-19: Every app sits behind one gateway that asks VoidAuth about each request, and apps read the person from its headers instead of being OIDC clients with their own device sessions. As OIDC clients, apps could not learn of a sign-out made elsewhere, so signing out once did not sign the browser out of every app ([`FINDINGS.md`](../../spikes/voidauth-proxyauth-poc/FINDINGS.md), PR #68). The admin now grants each app and its level through VoidAuth groups, which replaces the first `auth_admins` member becoming an app's first owner.
- 2026-10-17: Accepted. VoidAuth was the one sign-in, with each app an OIDC client keyed by `sub` and keeping its own members, roles and device sessions. The first `auth_admins` member to sign in to an app became its first owner.
