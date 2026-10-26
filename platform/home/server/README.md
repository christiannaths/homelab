# Home server

Serves Home's web client, an installable app that opens offline. It sits behind the homelab gateway, which lets only signed-in people through ([ADR-PLAT-004](../../../docs/adr/ADR-PLAT-004-sign-in.md)). It keeps no data, and needs no setting but its port: the person and their apps come from the accounts site's `/api/me`, which the web client asks itself ([accounts service](../../accounts/README.md)).

## Routes

| Route |  |
| --- | --- |
| `GET /api/health` | `{ ok: true }` |
| `GET /api/sign-in` | Redirects to `/`. The client loads it as a page, so a signed-out browser meets the gateway, which sends it to the accounts service's sign-in page and back |
| `GET /*` | The web client's files, and its app shell for any other path. Fingerprinted files under `assets/` are kept for a year; the rest, the service worker and the app shell included, are revalidated on every load so updates reach devices |

## Settings

| Variable | Default |     |
| -------- | ------- | --- |
| `PORT`   | `3000`  |     |

The accounts service lets every signed-in account reach Home, with no App access needed.

## Tests

```sh
npx nx test home-server   # serving the web client, from a stand-in build
npx nx e2e platform-e2e   # Caddy, the accounts service, Notes, the Encyclopedia and Chromium; Docker, ports 8473 and 4130
```

The end-to-end suite drives Playwright's Chromium, or the one at `PLAYWRIGHT_CHROMIUM_PATH`, and `KEEP_STACK=1` leaves the containers running afterwards.
