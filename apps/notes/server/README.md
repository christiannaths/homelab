# Notes server

The Notes server ([ADR-NOTE-014](../docs/adr/ADR-NOTE-014-http-and-accounts.md)): Hono serves HTTP, Hocuspocus syncs documents behind it, and everything is stored in one SQLite file. It sits behind the homelab gateway, which asks the homelab's accounts service about every request and passes the signed-in person on in `Remote-*` headers ([ADR-PLAT-004](../../../docs/adr/ADR-PLAT-004-sign-in.md), [ADR-NOTE-009](../docs/adr/ADR-NOTE-009-identity.md)). Notes has no sign-in code or sessions of its own.

## What it does so far

- People with admin-level App access to Notes are owners, and people with member-level App access are members, as [`@homelab/identity`](../../../packages/identity) reads their level from the headers. The gateway turns everyone else away before Notes sees them. People are keyed by their account id (`Remote-User`).
- Until the access rules are built ([ADR-NOTE-011](../docs/adr/ADR-NOTE-011-access-control.md)), only owners open documents.
- It serves the web client ([`../web`](../web)), an installable app that opens offline. Until workspaces and pages exist, the client has one page, saying who is signed in, with the [App switcher](../../../platform/app-switcher/README.md) at the top, which the gateway adds. Signing out is the switcher's: Notes has no sign-out of its own.

## Routes

| Route |  |
| --- | --- |
| `GET /api/health` | `{ ok: true }` |
| `GET /api/session` | `{ person }`, the person the gateway signed in. 401 for a request that did not come through the gateway |
| `GET /api/sign-in` | Redirects to `/`. The client loads it as a page, so a signed-out browser meets the gateway, which sends it to the accounts service's sign-in page and back |
| `GET /sync` | The Hocuspocus WebSocket. 401 before the upgrade for a request that did not come through the gateway |
| `GET /*` | The web client's files, and its app shell for any other path outside `/api` and `/sync` |

## Settings

Environment variables, for now read directly (issue #40):

| Variable | Default |  |
| --- | --- | --- |
| `PORT` | `3000` |  |
| `DATA_DIR` | `apps/notes/server/data` | Holds `notes.sqlite`. Backing it up backs up the instance |

### The gateway and the accounts service

Notes trusts the `Remote-*` headers on every request, so **only the gateway may reach it**: never publish its port. The gateway must delete any `Remote-User`, `Remote-Name`, `Remote-Email` and `Remote-Groups` headers the browser sent before asking the accounts service, as the sign-in check in [`platform/gateway/signed-in.caddyfile`](../../../platform/gateway/signed-in.caddyfile) does.

In the [accounts service](../../../platform/accounts/README.md), `notes` must be one of the installed apps (`HOMELAB_APPS`), so people can be given App access to it.

## Running the client

The server serves the client's production build from `apps/notes/web/dist`, which `npx nx build notes-web` makes. To try Notes signed in, behind the gateway, run `npm run dev` from the repository root ([`tools/dev/README.md`](../../../tools/dev/README.md)).

To work on the client with hot reload, run the server, then Vite:

```sh
npx nx dev notes-server
npx nx dev notes-web   # http://localhost:5173, proxying /api and /sync to the server on port 3000
```

Without the gateway in front, nobody is signed in, and the client waits as if offline. Send the gateway's headers yourself to work signed in, for example with a browser extension that adds `Remote-User`. The service worker exists only in the production build, so offline starts are tried there.

## Tests

```sh
npx nx test notes-server   # sends the gateway's headers itself; nothing to install
npx nx e2e notes-e2e       # Chromium, behind a stand-in for the gateway; no Docker
```

The end-to-end suite is described in [`../e2e/README.md`](../e2e/README.md).
