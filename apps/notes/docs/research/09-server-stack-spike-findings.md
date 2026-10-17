# Server stack spike findings: Hono, Hocuspocus and Better Auth

**Goal:** check that the server libraries proposed in [`08-framework-options.md`](08-framework-options.md) work together:
1. Hono serves the PWA and the API.
2. Hocuspocus runs behind Hono through `handleConnection`.
3. A Better Auth session cookie authenticates the sync socket.
4. A long-lived session keeps a device working offline, and revoking the session stops it syncing.

**Spike:** [`spikes/notes-server-stack-poc/`](../../../../spikes/notes-server-stack-poc/README.md), server only, with no client UI.

**Stack used:** Node.js 26.12, Hono 4.13 on `@hono/node-server` 2.1 (with `ws` 8.22), Hocuspocus 4.7, Better Auth 1.7.10 (username and admin plugins) on `node:sqlite`, Yjs 13.6.

## Results

All 17 Vitest tests pass, in three runs in a row (about 10 s per run). Each test starts a real server with its own data directory and connects real Hocuspocus providers over WebSockets.

| Check | Result |
|---|---|
| Health, static files, client-side route fallback | ✅ |
| First-run setup creates the admin once, then returns 409 | ✅ |
| No public sign-up; only an admin can create accounts | ✅ |
| Repeated failed sign-ins get 429 | ✅ |
| Two people co-edit a doc; it survives a server restart | ✅ |
| 300 docs sync over one socket | ✅ |
| No cookie, or a forged one, gets 401 before the upgrade | ✅ |
| Per-document access on one socket: a denied doc fails, and the socket stays usable | ✅ |
| Read-only doc: the viewer is told `readonly`, and its edits never reach the server or other devices | ✅ |
| Session cookie lasts a year (`Max-Age=31536000`, `HttpOnly`) | ✅ |
| A session last extended 200 days ago still connects, and connecting extends it to a year again | ✅ |
| An HTTP session check renews the cookie | ✅ |
| An expired session gets 401 | ✅ |
| An admin revoking someone's sessions closes their open socket (code 4401) and blocks reconnecting | ✅ |
| Signing out closes that device's socket, but not the same person's other devices | ✅ |
| Edits made offline sync after reconnecting with the same session | ✅ |

Two mutations confirmed that the tests catch failures. Removing the read-only flag fails the read-only test. Removing the socket close on revocation fails both revocation tests.

## How it fits together

- **The whole server is about 260 lines** (`app.ts`, `auth.ts`, `store.ts`, `index.ts`). It replaces the first spike's HTTP handling through Hocuspocus's `onRequest` hook (with `throw null`) and its hand-written static server.
- **The sync route runs in two steps:**
  1. Hono middleware checks the session with `auth.api.getSession({ headers })`, and refuses with 401 before any WebSocket exists.
  2. `upgradeWebSocket` then hands the socket to `hocuspocus.handleConnection()`, passing the user and session as the connection's context, and forwards messages and closes.
- **Hocuspocus's `onAuthenticate` still runs for every document**, and that is where access is decided ([ADR 12](../adr/0012-access-control.md)). It reads the context and needs no database round trip for the session. Setting `connectionConfig.readOnly` gives Can view and Can comment ([ADR 13](../adr/0013-page-permissions.md)) with no extra code.
- **Revocation:** the server keeps a map from session to open sockets. Better Auth's `databaseHooks.session.delete.after` fires on sign-out and on the admin's bulk `revoke-user-sessions`, and closes the matching sockets with code 4401.
- **Storage:** accounts, sessions, rate-limit counters and Yjs documents share one SQLite file in `DATA_DIR`, so [ADR 6](../adr/0006-document-persistence.md)'s "back up one file" still holds. Better Auth creates its tables at startup through `getMigrations`.
- **Dependencies:** 25 new runtime packages, none with native code or install scripts. Better Auth brings Kysely, Zod, jose and `@noble/*`. Its telemetry is off by default and is also turned off explicitly ([ADR 4](../adr/0004-hosting-and-scale.md)).

## Gotchas found

1. **Better Auth requires an email on every user,** but [ADR 10](../adr/0010-identity.md) accounts have only a username. The spike stores a placeholder address on the reserved `.invalid` domain (`sam@users.invalid`).
2. **Rate limiting needs the client's IP.** Without it, Better Auth puts every client into one shared bucket per route, and warns about it. One person's failed sign-ins would then lock everyone out for the window. Behind `tailscale serve` or Caddy, the real app must set `advanced.ipAddress.ipAddressHeaders` to the proxy's forwarded header. Rate limiting is also on by default only in production, so the spike turns it on explicitly.
3. **The socket extends the session but not the cookie.** The session check on upgrade extends the session in the database, but a WebSocket upgrade does not set a new cookie, so the browser's cookie would still expire a year after sign-in. The PWA should call `GET /api/auth/get-session` over HTTP whenever it is online, which renews the cookie (tested).
4. **Read-only edits are dropped silently.** The server never applies a viewer's update, but the edit stays in the viewer's local copy, and would also stay in IndexedDB. The client must turn editing off when `provider.authorizedScope` is `readonly`, as [ADR 13](../adr/0013-page-permissions.md) already says. Edits made before the device learns it lost write access need the "keep a private copy" flow from [ADR 12](../adr/0012-access-control.md).
5. **An open socket is not closed when its session expires.** Only deletion closes sockets. An expired session is refused at the next reconnect. With sessions extended on every use, this only affects a device that stays connected for a whole year without reconnecting.
6. **Hocuspocus's `onRequest`, `onUpgrade` and `onListen` hooks do not fire** behind Hono. Nothing in Notes needs them.
7. **Better Auth stores dates as ISO strings** in SQLite. This matters only for SQL written by hand against its tables.
8. **Startup logs a "Database schema mismatch" error** on a fresh data directory, before the migration creates the tables. It is harmless, but is noise in the logs.
9. **Something in the stack touches `localStorage`**, which Node 26 warns about. The scripts pass `--no-experimental-webstorage`, as the first spike's server did.

## What this means for the ADRs

- **[ADR 10](../adr/0010-identity.md)** can be implemented with Better Auth without changing the decision. Its defaults match it: scrypt hashing, rate limiting, revocable sessions, and admin-created accounts.
- **[ADR 11](../adr/0011-sync-and-access-checks.md) already splits the check in two, as this spike does:** the session is checked once, when the socket opens, and access is checked for each document in `onAuthenticate`. Like ADR 11, the real app should not rely on Hocuspocus's silent read-only handling (gotcha 4).
- **[ADR 17](../adr/0017-http-and-accounts.md) records the result:** Hono serves HTTP, and Better Auth manages accounts and sessions.

## Not verified

- **A real browser.** The tests send the cookie on the upgrade from Node. A same-origin browser sends it automatically (`SameSite=Lax`), but no PWA was run against this server.
- **Can edit content** (inspecting which part of a database document an update changes, in `beforeHandleMessage`).
- **Behaviour behind `tailscale serve` or Caddy:** the forwarded IP for rate limiting, and the HTTPS base URL.
- **The Docker image.**
