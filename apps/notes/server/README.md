# Notes server

The Notes server ([ADR-NOTE-014](../docs/adr/ADR-NOTE-014-http-and-accounts.md)): Hono serves HTTP, Hocuspocus syncs documents behind it, and everything is stored in one SQLite file. People sign in through the homelab's VoidAuth ([ADR-PLAT-004](../../../docs/adr/ADR-PLAT-004-sign-in.md)), and each device keeps its own year-long session ([ADR-NOTE-009](../docs/adr/ADR-NOTE-009-identity.md)).

## What it does so far
- The first VoidAuth admin to sign in becomes the workspace owner. Any other VoidAuth account is turned away, until invites exist (issue #42).
- Until the access rules are built ([ADR-NOTE-011](../docs/adr/ADR-NOTE-011-access-control.md)), only owners open documents.
- It serves no web client yet.

## Routes
| Route | |
|---|---|
| `GET /api/health` | `{ ok: true }` |
| `GET /api/sign-in` | Sends the browser to VoidAuth |
| `GET /api/sign-in/callback` | Back from VoidAuth: admits the person, sets the `notes_session` cookie, and redirects to `/`. 403 `not_a_member` if Notes does not admit them |
| `GET /api/session` | The signed-in person, and a renewed cookie. 401 when signed out |
| `POST /api/sign-out` | Ends this device's session and closes its sync sockets (code 4401) |
| `GET /sync` | The Hocuspocus WebSocket. 401 before the upgrade without a valid session |

## Settings
Environment variables, for now read directly (issue #40):

| Variable | Default | |
|---|---|---|
| `OIDC_ISSUER` | required | VoidAuth's issuer, `<VoidAuth's APP_URL>/oidc` |
| `OIDC_CLIENT_SECRET` | required | Notes' client secret in VoidAuth |
| `OIDC_CLIENT_ID` | `notes` | |
| `PUBLIC_URL` | `http://localhost:$PORT` | The address devices use. VoidAuth must allow `$PUBLIC_URL/api/sign-in/callback` as a redirect URL |
| `PORT` | `3000` | |
| `DATA_DIR` | `apps/notes/server/data` | Holds `notes.sqlite`. Backing it up backs up the instance |

## Tests
```sh
npx nx test notes-server   # a stand-in for VoidAuth, nothing to install
npx nx e2e notes-e2e       # the real VoidAuth image; needs Docker, uses ports 3330 and 4120
```
