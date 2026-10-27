# ADR-PLAT-004. How do people sign in to the homelab's apps?

- Status: Accepted
- Date: 2026-10-26
- Depends on: [ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)
- Dependency of: [ADR-ENCY-004](../../apps/encyclopedia/docs/adr/ADR-ENCY-004-identity.md), [ADR-NOTE-004](../../apps/notes/docs/adr/ADR-NOTE-004-hosting-and-scale.md), [ADR-NOTE-009](../../apps/notes/docs/adr/ADR-NOTE-009-identity.md), [ADR-NOTE-014](../../apps/notes/docs/adr/ADR-NOTE-014-http-and-accounts.md), [ADR-PLAT-008](ADR-PLAT-008-work-previews.md), [ADR-PLAT-009](ADR-PLAT-009-app-contract.md)

## Context

A few people use several apps on one home server behind an HTTPS-terminating proxy. Sign-in should work like a Google account: one account, one sign-in and sign-out for every app, apps granted per person by the admin, no public sign-up, and no app owning password, rate-limit or session code. Pages must look like the homelab and ask nothing unneeded.

## Decision

### Accounts service and gateway

- [`platform/accounts/`](../../platform/accounts/README.md) at `accounts.<domain>` ([ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)): Node on Better Auth (exact version), one SQLite file. Better Auth keeps accounts, passwords, sessions; the service owns pages, App access, forward auth and `/api/me`. Routes and settings: its README.
- Email + password; emails stored lowercase, matched in any case. Better Auth's sign-up is off: accounts come from invites or the test-people loader.
- Each app at the root of its own subdomain under one parent domain (`notes.home.example`): own origin keeps offline data separate; bundled apps expect a root. Cookie on the parent domain, so one sign-in and sign-out cover all.
- `HOMELAB_URL` (https, parent domain, port) is the only address setting; the service derives the rest, apps and Home take none. Whatever starts the gateway passes it the hostname from that value.
- Gateway: pinned Caddy 2.10.2 build ([`platform/gateway`](../../platform/gateway/README.md)); each app's site imports the sign-in-check and switcher snippets. Only it reaches apps and the service.
- The gateway deletes browser-sent `Remote-*`, then asks `/api/authz/forward-auth`, answered from the database each time (no cookie cache, so revocations bite next request):

| Request | Answer |
| --- | --- |
| Signed in, with App access | 200 with all of `Remote-User` (account id), `Remote-Name`, `Remote-Email`, `Remote-Groups` |
| No session | redirect to sign-in and back |
| No App access, or not an installed app | 403 no-access page on the app's address; nothing reaches the app |
| `/manifest.webmanifest`, `/icons/*` | pass signed out, so the service reads apps' names and icons |

- Apps have no sign-in code or session; they key people by `Remote-User`, never email or name ([ADR-PLAT-009](ADR-PLAT-009-app-contract.md)).

### App access and Home

- Records of (person, app, `member` | `admin`), sent as `<app>` / `<app>-admins` in `Remote-Groups`; the app decides what levels mean. Only apps in `HOMELAB_APPS`.
- Homelab admin is a flag for managing people; it opens no app.
- `/api/me` (person, addresses, Home + granted apps from manifests read via the gateway, [`platform/app-manifests`](../../platform/app-manifests)) feeds the switcher and Home, so apps never register. It's outside the sign-in check, so signed out is a readable 401, not "unreachable". An unreadable manifest logs one warning. Details: [README](../../platform/accounts/README.md#who-is-signed-in-and-their-apps).
- Home: open to all, always listed, optional; its server only serves its client.

### Sessions and checks

- One year; cookie `HttpOnly`, `Secure`. Extended at most daily, with a fresh cookie, by the switcher's POST to `/session` and by accounts pages. Never by forward auth: Caddy passes back no cookie, so the database would outlive it.
- Sign-in rate limit per gateway-seen address (last `X-Forwarded-For`), so a browser can't pick a fresh one; no address shares one limit. `SIGN_IN_RATE_WINDOW`, `SIGN_IN_RATE_MAX`.
- Return addresses must be under the parent domain on `HOMELAB_URL`'s scheme and port, else the account page (no open redirect). `/session`, `/sign-out`, `/api/me` refuse cross-site requests and other origins.
- Forms are accepted only from the accounts site's own pages; sibling subdomains count as other sites, since the cookie reaches them.

### Pages

- Server-rendered, `@homelab/theme`, light/dark, no script, loading screen or language picker: sign-in, account, People, join, "invite can't be used", no access.
- Account page (`/`, signed out → sign in and back): name, email, apps with level. Change name (in `Remote-Name` next request) or password (needs current; 8+ chars; old stops at once; other devices stay in). Admins get a `/people` link.

### Invites

- The only way in. An admin invites one email without an account, with App access; no email is sent, so the link shows once.
- `/join/<token>`: 256-bit, stored as SHA-256 only, so the database alone can't join. Email fixed whatever the form sends; asks name and password; signs in.
- One use, one week, cancellable; otherwise 410. Removing the inviter removes their invites.
- With no accounts, the service prints a setup invite for a homelab admin; it dies once any account exists, so a logged link is harmless.

### People page

Admins only (else 403), acting on anyone, self too, via `/people/<account id>/<action>`; applies next request.

| Action | Effect |
| --- | --- |
| App access | grant, remove, re-level |
| Admin switch | on/off; all admins equal |
| Sign out everywhere | deletes their sessions |
| Remove | deletes account, sessions, access, its invites; apps keep content; re-invite = new id |

- The last admin can't be demoted or removed (409); changes run one at a time so two admins can't race past it.

### Sign-out

- POST to `/sign-out` from the switcher (`fetch`, 204 with CORS, then sign-in returning to the page) or a page form (redirect); GET is 405. Ends that browser's session for every app and tab; other browsers stay in. No confirm step; one can go in the switcher.

### App switcher

- One script from `platform/app-switcher`, inlined by the gateway into every HTML page of every app and the accounts site, so no app installs it. Shadow DOM; same everywhere, no options; a top-centre tab that never changes layout ([README](../../platform/app-switcher/README.md)).
- Whole-page fetches only, incl. service workers saving pages. Script-limiting CSPs get its hash, with no per-app setting, except `'unsafe-inline'`-only lists, which a hash would disable. Validators dropped so no stale switcher ([rules](../../platform/gateway/README.md#what-the-switchers-module-changes)).
- Offline it shows its kept answer and icons; apps not opening offline, Account settings and Sign out grey out. Home's tiles match.

### Test people and dev sign-in

- [`test-people.ts`](../../platform/accounts/src/test-people.ts) (run as `load-test-people.ts`) sets people exactly; `--only-missing` adds absent ones. E2E, dev (`tools/dev/`) and previews (`tools/preview/`, [ADR-PLAT-008](ADR-PLAT-008-work-previews.md)) load [`tools/test-people.ts`](../../tools/test-people.ts).
- Passwordless `/test-sign-in` links exist only with `TEST_SIGN_IN_LINKS=on` (dev compose only); refused when `NODE_ENV` is `production`.

## Alternatives considered

- **VoidAuth** (used until spec #110): unshapeable pages, username sign-in, admin rights too broad for invites.
- **Apps as OIDC clients** (PR #66): VoidAuth's back-channel logout refuses private addresses, so sign-out couldn't reach apps.
- **Each app owns accounts**: every app owns password security; a password per app.
- **Authentik**: fits, but Postgres + server + worker, ~2 GB ([`auth-provider-comparison.md`](../research/auth-provider-comparison.md)).
- **Authelia**: no invites or people admin.
- **App access as a comma-separated field**: records check, list and change per app, and refuse unknown levels.
- **Better Auth's cookie cache**: forward auth is ~1 ms without; with it, revocations lag ([`FINDINGS.md`](../../spikes/better-auth-sign-in-poc/FINDINGS.md)).

## Evidence

- `platform/accounts/test/` (#111): forward-auth cases, sign-in, return check, cookie, unforgeable rate limit.
- `platform/e2e/` (#111): one sign-in opens every app; no-access page leaks nothing.
- `platform/accounts/test/` + `platform/e2e/` (#113): sign-out ends one browser; GET and cross-site refused.
- `platform/accounts/test/` (#122): bad `HOMELAB_URL` stops start-up; ports carry through.
- `platform/accounts/test/` + `platform/e2e/` (#114): account page changes; foreign forms refused.
- `platform/accounts/test/` + `platform/e2e/` (#115): invite lifecycle; setup invite only when empty.
- `platform/accounts/test/` + `platform/e2e/` (#116): People actions apply next request; last admin kept.
- `platform/accounts/test/` (#112): dev links only in dev, never in production.
- `platform/accounts/test/` (spec #110 fixes): daily cookie refresh; concurrent joins make one account.
- `platform/accounts/test/` + `platform/e2e/` (spec #110): `/session` refreshes; every app gets 204.
- `tools/preview/preview.test.ts` (#112): previews sign in, limit by real address, no test links.
- Better Auth spike, PR #109 ([`FINDINGS.md`](../../spikes/better-auth-sign-in-poc/FINDINGS.md)): 11 Chromium tests through the gateway.
- `platform/gateway/test/signed-in.test.ts` (#86): only manifest and icons are public.
- `platform/e2e/` (#87): people see only granted apps.
- `platform/accounts/test/me.test.ts` (#124): `/api/me` answers; switcher works without Home.
- `platform/e2e/` (#88, #102, #104): switcher menu, theme, isolation; tab moves nothing.
- `platform/e2e/` + gateway unit tests (#103): strict CSP still shows the switcher.
- `platform/gateway/test/switcher.test.ts` (#102, #103): injection, pass-through, compression, CSP.
- `platform/e2e/` (#91, #105): apps open offline with the kept switcher.
- ProxyAuth spike, PR #68 ([`FINDINGS.md`](../../spikes/voidauth-proxyauth-poc/FINDINGS.md)): service worker and WebSocket through forward auth.

## Consequences

- Apps and the service trust headers, so only the gateway may reach them.
- New app = gateway site + [app contract](ADR-PLAT-009-app-contract.md) + `HOMELAB_APPS` entry; Home doesn't change.
- Manifests are read at public addresses, or via `GATEWAY_URL` (`GATEWAY_CA`).
- Every app request needs the service up; offline-first apps use what they kept.
- The homelab owns the security code around Better Auth; fixes = bumping the pin.
- Only switcher and accounts pages keep sessions alive; an API client lapses after a year.
- Saved offline pages show the old switcher until the app updates.
- The gateway buffers HTML, so slow streams arrive whole.
- Apps learn of sign-out next request; open WebSockets stay until reconnect. With the service unreachable, the switcher's Sign out fails and says so.
- Browsers only; no tokens. No password reset: re-invite as a new id.
- Account removal has no confirm (no script); one can go before the POST.
- Nothing private at `/manifest.webmanifest` or `/icons/`.
- Previews: service shares the gateway's container (`ACCOUNTS_UPSTREAM`); the gateway passes Fly's client address as the only `X-Forwarded-For`.
- `TEST_SIGN_IN_LINKS` must never be on where others can reach the homelab.
- Untested: Traefik, nginx, real certificates.

## Changelog

- 2026-10-26: `/api/me` moves from Home to the accounts service, which already holds session, access and manifests, so Home no longer duplicates that work and installs without Home keep the switcher (issue #124, spec #119).
- 2026-10-26: One `HOMELAB_URL` replaces `HOMELAB_DOMAIN` and `ACCOUNTS_URL`, two shapes of one fact that could disagree ([ADR-PLAT-005](ADR-PLAT-005-app-settings.md); issue #122, spec #119).
- 2026-10-24: The switcher extends sessions via `/session`, so people who only use apps aren't signed out after a year (maintainer, in review, spec #110).
- 2026-10-24: Forward auth stops extending sessions, because it extended the database but couldn't refresh the cookie (spec #110).
- 2026-10-23: People page for admins, because access could only be set with the loader and nobody could be signed out or removed (issue #116, spec #110).
- 2026-10-23: Invites and a setup invite, because a real install couldn't get its first person in (issue #115, spec #110).
- 2026-10-23: Dev and previews drop VoidAuth for the accounts service, so nothing runs VoidAuth (issue #112, spec #110).
- 2026-10-23: Account page shows apps and changes name and password, so people needn't ask an admin (issue #114, spec #110).
- 2026-10-23: Sign-out becomes a same-site POST, so no link or other site can sign someone out, with room for a confirm (issue #113, spec #110).
- 2026-10-23: Own Better Auth service replaces VoidAuth, whose pages couldn't be shaped, which used usernames, and whose admin rights couldn't be narrowed for invites (issue #111, spec #110, [`FINDINGS.md`](../../spikes/better-auth-sign-in-poc/FINDINGS.md)).
- 2026-10-23: The switcher keeps apps' icons itself, so apps' offline caching needs nothing for it (issue #105, spec #101).
- 2026-10-23: The switcher passes any CSP and VoidAuth pages get it, since VoidAuth allowed no setting or script of its own (issue #103, spec #101).
- 2026-10-23: The switcher becomes a top-centre tab, so it's the same in every app and never changes layout (issue #104, spec #101).
- 2026-10-23: The gateway inlines the switcher, so bundled apps get it unchanged and saved offline pages carry it (issue #102, spec #101).
- 2026-10-22: The switcher links to account settings, asked for while testing (spec #75).
- 2026-10-22: The switcher works offline, so it shows when an app opens offline or Home is down (issue #91, spec #75).
- 2026-10-22: Sign-out moves to the switcher, so it's the same in every app (issue #89, spec #75).
- 2026-10-22: Every app gets the switcher from Home, so switching apps works the same everywhere (issue #88, spec #75).
- 2026-10-22: Apps on subdomains; Home lists them from groups and manifests, a rule adding an app doesn't change (issue #87, spec #75).
- 2026-10-22: Manifests and icons readable signed out, so Home can read apps' names and icons itself (issue #86, spec #75).
- 2026-10-22: `auth.` renamed `accounts.`, for what people do there; the maintainer asked that nothing be called `auth` (PR #85).
- 2026-10-19: Forward auth replaces apps as OIDC clients, which couldn't learn of a sign-out elsewhere ([`FINDINGS.md`](../../spikes/voidauth-proxyauth-poc/FINDINGS.md), PR #68).
- 2026-10-17: Accepted, with VoidAuth as the one sign-in and apps as OIDC clients.
