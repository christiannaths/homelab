# Notes server

The Notes server ([ADR-NOTE-014](../docs/adr/ADR-NOTE-014-http-and-accounts.md)): Hono serves HTTP, Hocuspocus syncs documents behind it, and everything is stored in one SQLite file. People sign in through the homelab's VoidAuth ([ADR-PLAT-004](../../../docs/adr/ADR-PLAT-004-sign-in.md)), and each device keeps its own year-long session ([ADR-NOTE-009](../docs/adr/ADR-NOTE-009-identity.md)).

## What it does so far

- The first VoidAuth admin to sign in becomes the workspace owner. Any other VoidAuth account is turned away, until invites exist (issue #42).
- Until the access rules are built ([ADR-NOTE-011](../docs/adr/ADR-NOTE-011-access-control.md)), only owners open documents.
- It serves the web client ([`../web`](../web)), an installable app that opens offline. Until workspaces and pages exist, the client has one page, saying who is signed in.

## Routes

| Route |  |
| --- | --- |
| `GET /api/health` | `{ ok: true }` |
| `GET /api/sign-in` | Sends the browser to VoidAuth |
| `GET /api/sign-in/callback` | Back from VoidAuth: admits the person, sets the `notes_session` cookie, and redirects to `/`. Someone Notes does not admit is redirected to `/no-access`, with no session |
| `GET /api/session` | The signed-in person, and a renewed cookie. 401 when signed out |
| `POST /api/sign-out` | Ends this device's session, if any, and closes its sync sockets (code 4401). Returns `{ endSessionUrl }`, VoidAuth's page that signs the homelab account out. 502 `sign_out_unavailable` if VoidAuth cannot be reached; the device's session has still ended |
| `GET /sync` | The Hocuspocus WebSocket. 401 before the upgrade without a valid session |
| `GET /*` | The web client's files, and its app shell for any other path outside `/api` and `/sync` |

## Settings

Environment variables, for now read directly (issue #40):

| Variable | Default |  |
| --- | --- | --- |
| `OIDC_ISSUER` | required | VoidAuth's issuer, `<VoidAuth's APP_URL>/oidc` |
| `OIDC_CLIENT_SECRET` | required | Notes' client secret in VoidAuth |
| `OIDC_CLIENT_ID` | `notes` |  |
| `PUBLIC_URL` | `http://localhost:$PORT` | The address devices use. VoidAuth's settings for Notes are derived from it (below) |
| `PORT` | `3000` |  |
| `DATA_DIR` | `apps/notes/server/data` | Holds `notes.sqlite`. Backing it up backs up the instance |

### VoidAuth's settings for Notes

Notes is registered with VoidAuth as an OIDC client, with these addresses, where `<id>` is `OIDC_CLIENT_ID`:

| VoidAuth variable | Value |
| --- | --- |
| `OIDC_<id>_CLIENT_REDIRECT_URLS` | `$PUBLIC_URL/api/sign-in/callback` |
| `OIDC_<id>_CLIENT_POST_LOGOUT_URLS` | `$PUBLIC_URL/`, where VoidAuth returns the browser after signing out |

VoidAuth's sign-out page only returns to an `https:` address (or its own), so signing out works fully once Notes is served over HTTPS (ADR-NOTE-003).

## Running the client

The server serves the client's production build from `apps/notes/web/dist`. `npx nx start notes-server` builds it first.

To work on the client with hot reload, run the server with `PUBLIC_URL=http://localhost:5173`, so VoidAuth returns the browser to Vite's dev server, then run Vite:

```sh
PUBLIC_URL=http://localhost:5173 OIDC_ISSUER=… OIDC_CLIENT_SECRET=… npx nx dev notes-server
npx nx dev notes-web   # http://localhost:5173, proxying /api and /sync to the server on port 3000
```

VoidAuth must then also allow `http://localhost:5173/api/sign-in/callback`. The service worker exists only in the production build, so offline starts are tried there.

## Tests

```sh
npx nx test notes-server   # a stand-in for VoidAuth, nothing to install
npx nx e2e notes-e2e       # the real VoidAuth image and Chromium; needs Docker, uses ports 3330 and 4120
```

The end-to-end suite drives Playwright's Chromium (`npx playwright install chromium`), or the one at `PLAYWRIGHT_CHROMIUM_PATH`.
