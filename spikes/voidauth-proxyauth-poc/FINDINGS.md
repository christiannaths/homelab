# VoidAuth ProxyAuth spike: findings

Run on 2026-10-19 against VoidAuth **1.16.0** (`voidauth/voidauth:1.16.0@sha256:189ef16f…`, unmodified, SQLite) behind Caddy **2.10.2**, with Docker 29.8 and Chromium through Playwright. Evidence is the e2e suite in `e2e/tests/` (8 tests, all passing, about two minutes) and VoidAuth's source at the [v1.16.0 tag](https://github.com/voidauth/voidauth/tree/v1.16.0), read outside this repo.

## Recommendation

**ProxyAuth gives the "Google accounts" experience, with no sign-in code in the apps.** Every part of it worked in a real browser: one sign-in, a refusal from apps the admin didn't grant, and one sign-out for every app on the device. It also removes the back-channel logout problem that blocks #61: apps no longer hold a session of their own, so there is nothing to tell them when someone signs out.

Three things to carry into the decision:

- **The gateway must delete `Remote-*` headers from the browser** before asking VoidAuth. The setup in VoidAuth's own Caddy docs doesn't, and a forged header reached the app in this spike (below).
- **An offline-first app learns about a sign-out the next time it loads online.** Until then, its offline copy stays readable on that device.
- **This changes decided ADRs.** ADR-PLAT-004 and ADR-NOTE-014 have apps doing OIDC and keeping their own device sessions; with ProxyAuth, apps trust the gateway instead. Not changed in this spike.

## 1. Sign in once

**Works.** VoidAuth's session cookie, `x-voidauth-session`, is set on the parent domain (`SESSION_DOMAIN=home.test`, so `Domain=.home.test; HttpOnly; Secure`). The gateway asks VoidAuth (`GET /api/authz/forward-auth`) on every request to an app hostname. Opening Notes sends the person to VoidAuth's sign-in page, and after it straight back to Notes. Opening Encyclopedia afterwards needs no sign-in (`one sign-in opens every app the admin granted`).

The app gets `Remote-User` (username), `Remote-Name`, `Remote-Email` and `Remote-Groups` (comma-separated) from the gateway. A value VoidAuth can't send as a raw header arrives percent-encoded ([`server/util/proxyAuth.ts`](https://github.com/voidauth/voidauth/blob/v1.16.0/server/util/proxyAuth.ts)). `Remote-Name` and `Remote-Email` are left out for a person without a name or email.

## 2. Each person gets only the apps they were granted

**Works, through VoidAuth's groups.** Each app is a ProxyAuth domain (`notes.home.test/*`) with the groups allowed in. The admin grants an app by putting someone in one of its groups, here through the invite. Tested:

- A person outside the app's groups is sent to VoidAuth's "forbidden" page (`/forbidden?reason=user_group_missing`). The app's API and its WebSocket are refused too: nothing reaches the app.
- Removing someone from a group takes effect on their next request, with no sign-out: VoidAuth reads the person's groups per request.
- **Levels per app** come from naming: here `notes-admins` both lets a person in and makes them Notes' admin, while `notes` makes them a member. VoidAuth only says which groups a person is in; the app decides what a group means.
- `auth_admins` members get into every app, whatever its groups.
- **A hostname with no ProxyAuth domain is refused** (`/forbidden?reason=proxyauth_domain_no_match`), so forgetting to register an app fails closed. A domain with no groups at all lets in **every** signed-in person.
- Changes to ProxyAuth domains are cached for 30 seconds (`getProxyAuthWithCache`, from the source; not tested).

## 3. Sign out once

**Works, for the whole device.** An app's "Sign out" link goes to `https://auth.home.test/logout`. VoidAuth asks "Do you want to log out?", and after "Yes" ends its session and shows its sign-in page. Then every app in that browser, tabs already open included, goes back to the sign-in page on the next load, and the app's WebSocket is refused. Another browser signed in as the same person stays signed in (`one sign-out signs every app on the device out, and no other device`).

- The confirmation question can't be skipped: there is no OIDC client to vouch for the request.
- After signing out, VoidAuth goes to one place for all apps (`DEFAULT_REDIRECT`), not back to the app the person came from.
- An admin can sign a person out of every device (`POST /api/admin/user/signout/:id`, from the source; not tested).

## 4. Forged headers

**A gap in the documented setup, closed in the gateway.** Caddy's `forward_auth` with `copy_headers` overwrites only the headers VoidAuth sends. Bob has no email, so VoidAuth sends no `Remote-Email`, and with the Caddyfile from [VoidAuth's docs](https://github.com/voidauth/voidauth/blob/v1.16.0/docs/ProxyAuth-and-Trusted-Header-SSO-Setup.md) the `Remote-Email: ada@example.com` that Bob's browser sent reached the app. The same applies to `Remote-Name`, and to `Remote-Groups` for someone with no groups. `gateway/gateway.caddyfile` deletes all four request headers before asking VoidAuth; `a person can't claim someone else's name or groups through the gateway` checks it.

Because apps trust these headers, only the gateway may reach them: the apps publish no port in `compose.yaml`.

## 5. Offline PWA and sync through the gateway

**Both work.** A WebSocket upgrade passes through `forward_auth` with the session cookie, and the app sees the person on it. The service worker, registered through the gateway, opens the app offline with what it kept (`the app syncs over a WebSocket through the gateway and opens offline`).

What the gateway changes for an offline-first app:

- **Signed out, the app's requests get a redirect to VoidAuth, not a 401.** The page's `fetch("/api/me", { redirect: "manual" })` sees an `opaqueredirect`. The service worker must go network first and pass that redirect through, or a signed-out person would keep seeing the cached app.
- **A sign-out reaches an app the next time it loads online.** The stand-in's service worker sees the redirect on a page load and deletes everything the app kept on the device (`after signing out in another app, the next online visit wipes the offline copy`). If the device goes offline before that, the app still opens offline with the last person's data (`signed out while offline, the app still opens offline until it is next online`).
- A service worker needs a certificate the browser trusts. Chromium refuses to register one on a site with a certificate error, even with errors ignored, so the tests trust Caddy's CA by key (`--ignore-certificate-errors-spki-list`).

## 6. What it means for the apps

- **No OIDC client, callback, token check or session in the app.** The app reads four headers. The stand-in's whole identity code is `app/src/person.ts`.
- **Every app needs a hostname under the session domain** and a site in the gateway, plus a ProxyAuth domain and groups in VoidAuth. Both must be set up, or the app is refused (VoidAuth) or unprotected (gateway).
- **The app can't run safely without the gateway**, since it trusts whoever sends the headers. Tests of the app alone send the headers themselves.
- **Only browsers and Basic auth.** Without a cookie, VoidAuth also accepts a username and password in `Authorization` or `Proxy-Authorization`. There are no tokens for other clients.
- VoidAuth's admin pages hold the per-app grants (groups, ProxyAuth domains, invites with groups); the invite service in ADR-PLAT-004 still applies.

## Notes

- The second app is the same stand-in as Notes. The Encyclopedia stub page (draft PR #67) is not on `main` yet; using it means pointing the `encyclopedia` site in the Caddyfile at its build.
- Tested on port 8453 with `--host-resolver-rules`; a real install uses 443 and DNS.

## What this spike did not test

- Real certificates, Traefik or nginx (nginx uses `/api/authz/auth-request`, which answers 401 instead of a redirect).
- Passkeys, MFA, or ProxyAuth's per-domain MFA and maximum session length.
- An installed PWA window (only a service-worker reload in a tab).
- Email, and VoidAuth upgrades.
