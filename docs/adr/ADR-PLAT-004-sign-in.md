# ADR-PLAT-004. How do people sign in to the homelab's apps?

- Status: Accepted
- Date: 2026-10-23
- Depends on: [ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)
- Dependency of: [ADR-ENCY-004](../../apps/encyclopedia/docs/adr/ADR-ENCY-004-identity.md), [ADR-NOTE-004](../../apps/notes/docs/adr/ADR-NOTE-004-hosting-and-scale.md), [ADR-NOTE-009](../../apps/notes/docs/adr/ADR-NOTE-009-identity.md), [ADR-NOTE-014](../../apps/notes/docs/adr/ADR-NOTE-014-http-and-accounts.md), [ADR-PLAT-008](ADR-PLAT-008-work-previews.md)

## Context

The homelab runs several apps for the same few people, on a home server reachable from the internet behind a reverse proxy that terminates HTTPS. Signing in should work like a Google account: one homelab account, one sign-in for every app, and one sign-out that signs the browser out of every app at once. The homelab admin decides, person by person, which apps each person can use and at what level. Passwords, password resets, rate limiting and session revocation are security-sensitive code that no app should have to own on its own. Only people already in should be able to bring someone new in: registration is closed, and an invite link is the only way to create an account.

## Decision

- **VoidAuth holds the homelab account**, at `accounts.<domain>`, where people sign in and manage their account. It runs from its official image, unmodified and pinned by version and digest, on SQLite. The repo contains none of its code (it is AGPL-3.0).
- **Every app sits behind one gateway that asks VoidAuth about each request** (VoidAuth's ProxyAuth, through the gateway's forward auth):
  - Each app is served at the root of its own subdomain directly under one parent domain (`notes.home.example`), with VoidAuth at `accounts.` and Home at `home.`. An app on its own origin keeps its offline data, storage and service worker its own, and bundled apps expect to be served at the root of an address, not under a path. VoidAuth's session cookie is set on the parent domain (`SESSION_DOMAIN`), so one sign-in covers every app and one sign-out ends it for all of them.
  - Before passing a request on, the gateway sends it to VoidAuth's `/api/authz/forward-auth`. VoidAuth answers with the person in `Remote-User`, `Remote-Name`, `Remote-Email` and `Remote-Groups`, or sends the browser to its sign-in page or its "forbidden" page.
  - The gateway must delete any `Remote-*` headers the browser sent before asking VoidAuth, because VoidAuth leaves out the headers it has no value for.
  - An app's web app manifest (`/manifest.webmanifest`) and its icons (`/icons/*`) skip the check and are readable without signing in, so Home can learn every app's name and icon by itself, before anyone has opened the app. Every app keeps them at these paths, so one rule covers every app, and nothing else about an app is readable signed out. The `Remote-*` headers are deleted on these requests too.
  - An app's manifest marks it as opening offline with the homelab member `"homelab": { "opens_offline": true }`. An app without it counts as not opening offline.
  - Only the gateway reaches the apps: no app publishes a port of its own.
  - The gateway is the homelab's own build of Caddy ([`packages/gateway`](../../packages/gateway/README.md)): Caddy 2.10.2 with the homelab's module for the App switcher, every version pinned. Each app's site imports two snippets: the sign-in check, set up as in [`spikes/voidauth-proxyauth-poc/gateway/gateway.caddyfile`](../../spikes/voidauth-proxyauth-poc/gateway/gateway.caddyfile), and the App switcher.
- **Apps have no sign-in code.** An app reads the person from the gateway's headers on each request and keeps no session of its own. It identifies a person by their VoidAuth username (`Remote-User`), never by email.
- **The homelab admin grants apps through VoidAuth groups:**
  - Each app is a ProxyAuth domain in VoidAuth (`notes.home.example/*`), open to two groups named after its subdomain: `<app>` lets a person in, and `<app>-admins` lets them in as the app's admin.
  - VoidAuth refuses everyone else before the request reaches the app, and members of `auth_admins` reach every app.
  - The app decides what its levels mean, from `Remote-Groups`.
  - A person's apps are the apps named by their groups, so granting a group is all it takes to list an app for them. `auth_admins` names no app, so membership of it alone lists nothing: the homelab admin is given each app's group like everyone else.
- **Home is open to every account.** Its ProxyAuth domain has no groups, so every signed-in person reaches it. It lists each person's apps from their groups and from each app's manifest, which it reads itself, so an app shows up before anyone has opened it and apps never report themselves to Home.
- **The gateway adds the App switcher to every app's pages.** The switcher is one standalone script, built from `packages/app-switcher` into the gateway's image, and the gateway puts the whole script inline before the last `</body>` of every HTML page an app's site sends, so no app installs anything for it and updating the gateway updates it in every app. It asks Home's `/api/me` for the person and their apps, a cross-origin request that Home allows, with credentials, only for apps under the parent domain. It renders in its own shadow DOM.
  - Every fetch of a page gets it except one for a frame (`Sec-Fetch-Dest: iframe` or `frame`), which would show a second switcher. An offline-first app's service worker saving its page (`Sec-Fetch-Dest: empty`) gets it too, so the saved page carries the switcher.
  - The gateway changes nothing but HTML pages. It asks upstreams for pages without the browser's `Accept-Encoding`, so its proxy asks for gzip and undoes it, and compresses the page again for the browser. It drops a page's `ETag` and `Last-Modified`, so no browser revalidates its way into keeping an old switcher.
  - It works offline, from Home's last answer: it keeps Home's last answer on the device for each app, and shows it when the device is offline or Home cannot be reached. Offline, apps whose manifest does not mark them as opening offline are greyed out, and so are Account settings and Sign out, with "Needs a connection". From another app's page, VoidAuth's redirect for a signed-out browser fails like an unreachable Home, so the switcher then reads Home's public manifest: Home answering means signed out, and the kept answer is cleared. It asks Home again on every load and when the device comes back online, so access granted or removed meanwhile shows up then. Each offline-first app's service worker keeps a copy of the other apps' icons, from the route in `@homelab/app-switcher/caching`. Icons load with CORS, which the gateway allows for `/icons/*` from any page, so the service worker can tell an error apart from a good copy and keeps only good ones. Home's tiles grey out the same apps offline.
- **A person's account settings are VoidAuth's own pages** at `accounts.`, which the App switcher's Account settings opens. Homelab has no profile page of its own.
- **Signing out is VoidAuth's `/logout` page**, which the App switcher's Sign out opens. Apps have no sign-out of their own. After the person confirms, every app in that browser is signed out on its next request, and other browsers stay signed in.
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

- `packages/gateway/test/signed-in.test.ts` runs the sign-in check in the gateway image: the manifest and icons pass with forged `Remote-*` headers deleted, and every other path, including `/icons/../index.html` and its encoded forms, goes to sign in. The preview image test reads Notes' and the Encyclopedia's manifests and icons signed out (PR for issue #86).
- Home's server tests (`apps/home/server/test/`) and the Home end-to-end suite (`apps/home/e2e/`), in Chromium through Caddy 2.10.2 and VoidAuth 1.16.0: an account with no groups sees only Home, `-admins` groups count, groups with no manifest are skipped, and the homelab admin sees only the apps it was given (PR for issue #87).
- The Home end-to-end suite's switcher tests: the user icon's initials and colour, the menu's contents and order, signing out of Home, Notes and the Encyclopedia from it, the keyboard, its themes and style isolation, all with nothing for the switcher in the apps (PR for issue #88, issue #102).
- `packages/gateway/test/switcher.test.ts` runs the gateway image in front of a stand-in app: pages get the switcher inline, including service-worker fetches and error pages, and lose their validators; framed pages, scripts, API answers and `HEAD` requests pass through untouched; a page an app compresses itself gets the switcher, and one compressed in a way the gateway cannot undo passes through intact (issue #102).
- The Home end-to-end suite's offline tests: after one online visit, Home, Notes and the Encyclopedia open with the network cut and show the user icon and the last list of apps; an app that doesn't open offline and Sign out are greyed out; access granted or removed shows on the next online load and on coming back online; and with Home stopped, the switcher shows the kept answer (PR for issue #91).
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
- Adding an app means a site in the gateway that imports its two snippets, its manifest and icons at the fixed paths, and a ProxyAuth domain with its two groups, named after its subdomain, in VoidAuth. Nothing changes in Home. A hostname without a ProxyAuth domain is refused, but a ProxyAuth domain without groups lets in every signed-in person, as Home's does.
- Home reaches each app's manifest through the gateway at the app's public address, so the gateway must answer Home there, or be named to Home by an internal address (`GATEWAY_URL`).
- VoidAuth's admin pages can rename a username, and an app then sees a new person. Admins must not rename people.
- VoidAuth must be running for any app request to succeed, including on devices already signed in. An offline-first app keeps working from what it kept on the device.
- An offline-first app serves its saved page for every visit, online too, so it shows the switcher from the gateway that saved the page until the app next updates it. The menu's contents stay current, since they come from Home on every load.
- The gateway reads every HTML page into memory to change it, so a page streamed slowly reaches the browser only once it is complete.
- An app learns of a sign-out on its next request. An open WebSocket stays open until it reconnects, and an app opened offline shows what it kept until it is next online.
- After signing out, VoidAuth sends the browser to one address for all apps (`DEFAULT_REDIRECT`), not back to the app the person came from. Its "Do you want to log out?" question cannot be skipped.
- Only browsers can use the apps: without a cookie, VoidAuth accepts only a username and password in `Authorization`, and it has no tokens for other clients.
- VoidAuth has no API tokens, so the invite service signs in as an admin the way VoidAuth's web interface does. That interface is not a stable API: each VoidAuth upgrade is tested against the invite service before it is taken.
- Password resets, password rules and sign-in rate limiting belong to VoidAuth. An app has no password screens.
- An app keeps nothing at `/manifest.webmanifest` or under `/icons/` that is not meant for everyone, since those paths are public. A bundled app's site maps those two paths to its own manifest and icons when one is added.
- Not yet tested: Traefik or nginx as the gateway, real certificates, passkeys and MFA, and VoidAuth upgrades.

## Changelog

- 2026-10-23: The gateway, now the homelab's own Caddy build, puts the App switcher inline into every app's pages, instead of each app loading it from Home with a script tag, so a bundled app gets it without being changed and an offline-first app's saved page carries it (issue #102, spec #101).
- 2026-10-22: The App switcher's menu links to the person's account settings on VoidAuth (spec #75, asked for while testing).
- 2026-10-22: The App switcher keeps Home's last answer on the device, and every offline-first app's service worker keeps its script, so it shows when an app opens offline or Home is down (issue #91, spec #75).
- 2026-10-22: Signing out is the App switcher's Sign out in every app, and Notes' own sign-out is removed (issue #89, spec #75).
- 2026-10-22: Every app gets the App switcher from Home, through `/_homelab/switcher.js` on its gateway site, so switching apps and signing out work the same in every app (issue #88, spec #75).
- 2026-10-22: Each app is on its own subdomain directly under the parent domain, its VoidAuth groups are named after that subdomain, and Home, open to every account, lists each person's apps from those groups and the apps' manifests. `auth_admins` alone lists no app. Home needs a rule for finding apps that adding an app does not change (issue #87, spec #75).
- 2026-10-22: An app's manifest and icons are readable without signing in, so that Home can read each app's name and icon itself, and the manifest's `homelab` member says whether the app opens offline (issue #86, spec #75).
- 2026-10-22: VoidAuth is served at `accounts.<domain>`, named for what people do there (sign in and manage their account), instead of `auth.<domain>`. The maintainer asked that nothing be called `auth`, in the thread that built previews (PR #85).
- 2026-10-19: Every app sits behind one gateway that asks VoidAuth about each request, and apps read the person from its headers instead of being OIDC clients with their own device sessions. As OIDC clients, apps could not learn of a sign-out made elsewhere, so signing out once did not sign the browser out of every app ([`FINDINGS.md`](../../spikes/voidauth-proxyauth-poc/FINDINGS.md), PR #68). The admin now grants each app and its level through VoidAuth groups, which replaces the first `auth_admins` member becoming an app's first owner.
- 2026-10-17: Accepted. VoidAuth was the one sign-in, with each app an OIDC client keyed by `sub` and keeping its own members, roles and device sessions. The first `auth_admins` member to sign in to an app became its first owner.
