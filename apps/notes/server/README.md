# Notes server

The Notes server ([ADR-NOTE-014](../docs/adr/ADR-NOTE-014-http-and-accounts.md)): Hono serves HTTP, Hocuspocus syncs documents behind it, and everything is stored in one SQLite file. It sits behind the homelab gateway, which asks VoidAuth about every request and passes the signed-in person on in `Remote-*` headers ([ADR-PLAT-004](../../../docs/adr/ADR-PLAT-004-sign-in.md), [ADR-NOTE-009](../docs/adr/ADR-NOTE-009-identity.md)). Notes has no sign-in code or sessions of its own.

## What it does so far

- People in VoidAuth's `notes-admins` or `auth_admins` group are owners, and people in `notes` are members. VoidAuth turns everyone else away before Notes sees them.
- Until the access rules are built ([ADR-NOTE-011](../docs/adr/ADR-NOTE-011-access-control.md)), only owners open documents.
- It serves the web client ([`../web`](../web)), an installable app that opens offline. Until workspaces and pages exist, the client has one page, saying who is signed in.

## Routes

| Route |  |
| --- | --- |
| `GET /api/health` | `{ ok: true }` |
| `GET /api/session` | `{ person }`, the person the gateway signed in. 401 for a request that did not come through the gateway |
| `GET /api/sign-in` | Redirects to `/`. The client loads it as a page, so a signed-out browser meets the gateway, which sends it to VoidAuth's sign-in page and back |
| `GET /api/sign-out` | Redirects to VoidAuth's `/logout` page, which signs the browser out of every homelab app |
| `GET /sync` | The Hocuspocus WebSocket. 401 before the upgrade for a request that did not come through the gateway |
| `GET /*` | The web client's files, and its app shell for any other path outside `/api` and `/sync` |

## Settings

Environment variables, for now read directly (issue #40):

| Variable | Default |  |
| --- | --- | --- |
| `VOIDAUTH_URL` | required | VoidAuth's address, its `APP_URL` |
| `PORT` | `3000` |  |
| `DATA_DIR` | `apps/notes/server/data` | Holds `notes.sqlite`. Backing it up backs up the instance |

### The gateway and VoidAuth

Notes trusts the `Remote-*` headers on every request, so **only the gateway may reach it**: never publish its port. The gateway must delete any `Remote-User`, `Remote-Name`, `Remote-Email` and `Remote-Groups` headers the browser sent before asking VoidAuth, as [`../e2e/gateway.caddyfile`](../e2e/gateway.caddyfile) does.

In VoidAuth, Notes needs:

- `SESSION_DOMAIN` set to the parent domain of every homelab app, such as `home.example` for `notes.home.example`.
- The groups `notes` and `notes-admins`, given to people through their invites.
- A ProxyAuth domain for Notes' hostname (`notes.home.example/*`), open to both groups.

## Running the client

The server serves the client's production build from `apps/notes/web/dist`, which `npx nx build notes-web` makes. To try Notes signed in, behind the gateway and VoidAuth, run `npm run dev` from the repository root ([`tools/dev/README.md`](../../../tools/dev/README.md)).

To work on the client with hot reload, run the server, then Vite:

```sh
VOIDAUTH_URL=… npx nx dev notes-server
npx nx dev notes-web   # http://localhost:5173, proxying /api and /sync to the server on port 3000
```

Without the gateway in front, nobody is signed in, and the client waits as if offline. Send the gateway's headers yourself to work signed in, for example with a browser extension that adds `Remote-User`. The service worker exists only in the production build, so offline starts are tried there.

## Tests

```sh
npx nx test notes-server   # sends the gateway's headers itself; nothing to install
npx nx e2e notes-e2e       # Caddy, the real VoidAuth image and Chromium; needs Docker, uses ports 8463 and 4120
```

The end-to-end suite drives Playwright's Chromium (`npx playwright install chromium`), or the one at `PLAYWRIGHT_CHROMIUM_PATH`. It reaches the gateway as `*.home.test` without DNS, and trusts the gateway's own CA. Set `KEEP_STACK=1` to leave the containers running afterwards.
