# Home server

Answers who is signed in and which apps they have, for Home's tiles and every app's App switcher, and serves Home's web client. It sits behind the homelab gateway and reads the person from its `Remote-*` headers ([ADR-PLAT-004](../../../docs/adr/ADR-PLAT-004-sign-in.md)), as Notes does. It keeps no data.

## Finding a person's apps

- Each group in the person's App access (`Remote-Groups`) names an app at `<group>.<parent domain>`; `<app>-admins` counts as `<app>`.
- Home reads that address's `/manifest.webmanifest` through the gateway, without anyone's cookie, which the gateway allows for manifests and icons. A group with no manifest there is not an app.
- Manifests are kept for 5 minutes and shared by everyone's requests. An address with no manifest is asked again after a minute, and an app whose manifest stops answering stays listed for up to a day, in case it is restarting.
- Home itself is always listed.

## Routes

| Route |  |
| --- | --- |
| `GET /api/health` | `{ ok: true }` |
| `GET /api/me` | `{ person: { id, name, email }, accountUrl, signOutUrl, apps: [{ id, url, name, icon, opensOffline }] }`, `person.id` being the account id, apps sorted by name. 401 for a request that did not come through the gateway |
| `GET /api/sign-in` | Redirects to `/`. The client loads it as a page, so a signed-out browser meets the gateway, which sends it to the accounts service's sign-in page and back |
| `GET /*` | The web client's files, and its app shell for any other path |

`/api/*` answers are readable cross-origin, with credentials, by any app at `<one label>.<parent domain>` on the homelab's scheme and port, and by no other origin. Apps ask with a plain `GET`, which needs no preflight: a preflight carries no cookie, so the gateway would send it to sign in.

## Settings

Environment variables, for now read directly (issue #40):

| Variable | Default |  |
| --- | --- | --- |
| `HOMELAB_URL` | required | The parent address every app is a subdomain of, with its port if any, such as `https://home.example` or `https://homelab.localhost:8443`. The accounts service is at `accounts.` under it |
| `PORT` | `3000` |  |
| `GATEWAY_URL` | each app's own address | Where to reach the gateway to read manifests, when apps' names don't resolve to it where Home runs. Over `http:` Home sends `X-Forwarded-Proto: https`, as the proxy that ends TLS in front of such a gateway does |
| `GATEWAY_CA` | the system's CAs | A PEM file with the CA of the gateway's certificates, read when a manifest is fetched |

The accounts service lets every signed-in account reach Home, with no App access needed.

## Tests

```sh
npx nx test home-server   # sends the gateway's headers itself and stands in for apps' manifests
npx nx e2e home-e2e       # Caddy, the accounts service, Notes, the Encyclopedia and Chromium; Docker, ports 8473 and 4130
```

The end-to-end suite builds Notes' and the Encyclopedia's web clients itself, since they belong to other apps. It drives Playwright's Chromium, or the one at `PLAYWRIGHT_CHROMIUM_PATH`, and `KEEP_STACK=1` leaves the containers running afterwards.
