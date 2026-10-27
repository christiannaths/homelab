# Notes server

Hono for HTTP, Hocuspocus for sync, one SQLite file ([ADR-NOTE-014](../docs/adr/ADR-NOTE-014-http-and-accounts.md)). Behind the gateway, which supplies the person in `Remote-*` headers ([ADR-PLAT-004](../../../docs/adr/ADR-PLAT-004-sign-in.md), [ADR-NOTE-009](../docs/adr/ADR-NOTE-009-identity.md)); no sign-in or sessions of its own.

- Admin-level App access = owner, member-level = member (read by [`@homelab/identity`](../../../packages/identity)); keyed by `Remote-User`.
- Only owners open documents until access rules exist ([ADR-NOTE-011](../docs/adr/ADR-NOTE-011-access-control.md)).
- Serves the web client ([`../web`](../web)): one page saying who's signed in, plus the gateway's [App switcher](../../../platform/app-switcher/README.md), which owns sign-out.

## Routes

| Route |  |
| --- | --- |
| `GET /api/health` | `{ ok: true }` |
| `GET /api/session` | `{ person }`; 401 if not via the gateway |
| `GET /api/sign-in` | Redirects to `/`; loaded as a page so the gateway can send a signed-out browser to sign in and back |
| `GET /sync` | Hocuspocus WebSocket; 401 before upgrade if not via the gateway |
| `GET /*` | Client files; app shell for other paths outside `/api` and `/sync` |

## Settings

Read directly for now (issue #40):

| Variable | Default |  |
| --- | --- | --- |
| `PORT` | `3000` |  |
| `DATA_DIR` | `apps/notes/server/data` | Holds `notes.sqlite`; back it up to back up the instance |

**Only the gateway may reach it** (it trusts `Remote-*`): never publish its port. The gateway must strip browser-sent `Remote-User`, `Remote-Name`, `Remote-Email` and `Remote-Groups`, as [`signed-in.caddyfile`](../../../platform/gateway/signed-in.caddyfile) does. `notes` must be in the [accounts service](../../../platform/accounts/README.md)'s `HOMELAB_APPS`.

## Running the client

Serves `apps/notes/web/dist` (`npx nx build notes-web`). Signed in behind the gateway: `npm run dev` ([`tools/dev`](../../../tools/dev/README.md)). Hot reload:

```sh
npx nx dev notes-server
npx nx dev notes-web   # http://localhost:5173, proxying /api and /sync to the server on port 3000
```

Without the gateway nobody's signed in and the client waits as if offline; add `Remote-User` yourself (e.g. a browser extension). Try offline starts on the production build (service worker).

## Tests

```sh
npx nx test notes-server   # sends the gateway's headers itself; nothing to install
npx nx e2e notes-e2e       # Chromium, behind a stand-in for the gateway; no Docker
```

See [`../e2e/README.md`](../e2e/README.md).
