# Notes server

Hono for HTTP, Hocuspocus for sync, one SQLite file ([ADR-NOTE-014](../docs/adr/ADR-NOTE-014-http-and-accounts.md)). Behind the gateway, which supplies the person in `Remote-*` headers ([ADR-PLAT-004](../../../docs/adr/ADR-PLAT-004-sign-in.md), [ADR-NOTE-009](../docs/adr/ADR-NOTE-009-identity.md)); no sign-in or sessions of its own.

- People keyed by `Remote-User` (read by [`@homelab/identity`](../../../packages/identity)); member- and admin-level App access are treated alike.
- A person's first request makes them a workspace they own, "Ada's workspace" or "My workspace", with one empty page in their Private section; they can make more (`POST /api/workspaces`), which can't be deleted ([ADR-NOTE-011](../docs/adr/ADR-NOTE-011-access-control.md), [ADR-NOTE-013](../docs/adr/ADR-NOTE-013-data-layout.md)).
- Serves the web client ([`../web`](../web)), plus the gateway's [App switcher](../../../platform/app-switcher/README.md), which owns sign-out.

## Data

| Where | What |
| --- | --- |
| SQLite `people`, `workspaces`, `workspace_members` | Account data: who belongs to which workspace, as `owner`, `member` or `guest` |
| `index:<personId>` | Server-written, read-only to that person: `workspaces` (ids), `pages` (id → level) |
| `workspace:<id>` | `workspace` map, `name`; read-write to the workspace's members |
| `page:<id>` | `meta` (incl. `workspaceId`, `section` = `private`), `access` (`person:<id>` → level), `content` (BlockNote); opened at the person's level |

Shapes and access rules: [`notes-model`](../model) (`ydoc.ts`, `review.ts`). Other names are refused `no-access`. The catalog (`src/catalog.ts`) reads every stored page at start and each page after every applied change; indexes are rewritten when anyone's levels change. Every update is reviewed; a refused one closes only that document with its reason (`read-only`, `access-change-refused`, `placement-refused`), and the device drops its copy and syncs it again ([ADR-NOTE-010](../docs/adr/ADR-NOTE-010-sync-and-access-checks.md), [ADR-NOTE-013](../docs/adr/ADR-NOTE-013-data-layout.md)).

## Routes

| Route |  |
| --- | --- |
| `GET /api/health` | `{ ok: true }` |
| `GET /api/session` | `{ person: { id, name } }`, after making their default workspace on a first visit; 401 if not via the gateway |
| `POST /api/workspaces` | `{ name }` (JSON only, else 415) → 201 `{ workspace: { id, name } }`: a workspace the caller owns, with one empty page in their Private section, once their index lists it. Name trimmed, cut to 100 characters; missing or blank → 400. Renaming is through `workspace:<id>`, not HTTP |
| `GET /api/sign-in` | Redirects to `/`; loaded as a page so the gateway can send a signed-out browser to sign in and back |
| `GET /sync` | Hocuspocus WebSocket, one per device for all its documents; 401 before upgrade if not via the gateway |
| `GET /*` | Client files; app shell for other paths outside `/api` and `/sync`, such as a page's address `/pages/<id>` |

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
