# Home server

Serves Home's offline-capable web client behind the gateway ([ADR-PLAT-004](../../../docs/adr/ADR-PLAT-004-sign-in.md)); every signed-in account may reach it, no App access needed. No data: the client asks [`/api/me`](../../accounts/README.md) itself.

| Route |  |
| --- | --- |
| `GET /api/health` | `{ ok: true }` |
| `GET /api/sign-in` | Redirects to `/`; loaded as a page so the gateway can send a signed-out browser to sign in and back |
| `GET /*` | Client files; app shell for other paths. `assets/` (fingerprinted) cached a year; everything else, service worker and shell included, revalidated every load |

| Variable | Default |
| -------- | ------- |
| `PORT`   | `3000`  |

```sh
npx nx test home-server   # serving the web client, from a stand-in build
npx nx e2e platform-e2e   # Caddy, the accounts service, Notes, the Encyclopedia and Chromium; Docker, ports 8473 and 4130
```

e2e uses Playwright's Chromium or `PLAYWRIGHT_CHROMIUM_PATH`; `KEEP_STACK=1` keeps the containers.
