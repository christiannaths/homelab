# 18. Hono serves HTTP, and Better Auth manages accounts and sessions

- Status: Accepted
- Date: 2026-10-17
- Depends on: [ADR 3](0003-pwa-client.md), [ADR 4](0004-homelab-instance.md), [ADR 5](../../../../docs/adr/0005-typescript-and-node.md), [ADR 6](0006-sqlite-storage.md), [ADR 11](0011-local-accounts.md), [ADR 12](0012-hocuspocus-sync-server.md), [ADR 13](0013-access-model.md)
- Dependency of: none

## Context
The server is about to gain a real HTTP API: first-run setup, sign-in, invites, people and roles, sharing, teamspaces and attachments. The first spike served HTTP through Hocuspocus's `onRequest` hook ([ADR 12](0012-hocuspocus-sync-server.md)) and a hand-written static file server. Accounts ([ADR 11](0011-local-accounts.md)) are security-sensitive code: password hashing, sessions that last while a device is offline, revocation, rate limiting and admin-only account creation. A full-stack framework was ruled out, because every read is local and the server cannot query Yjs data ([`research/08-framework-options.md`](../research/08-framework-options.md)). The server must stay one Node process with one SQLite file and no external services ([ADR 4](0004-homelab-instance.md), [ADR 6](0006-sqlite-storage.md)).

## Decision
- **Hono serves all HTTP**, on `@hono/node-server` with its built-in WebSocket support (`ws`, `WebSocketServer` with `noServer: true`). That covers the API, the built PWA with a fallback to `index.html`, and the sync endpoint. `@hono/node-ws` is deprecated and is not used.
- **Hocuspocus runs behind Hono** without a server of its own ([ADR 12](0012-hocuspocus-sync-server.md)):
  - Hono's `upgradeWebSocket` passes each socket to `hocuspocus.handleConnection()`, with the signed-in person as the connection's context.
  - Hono forwards the socket's messages and close events to Hocuspocus.
  - Hocuspocus's `onRequest`, `onUpgrade` and `onListen` hooks are not used.
- **Better Auth implements [ADR 11](0011-local-accounts.md):**
  - Plugins: `username` (sign-in with a username) and `admin` (creating accounts, resetting passwords, revoking sessions).
  - It uses Node's `node:sqlite` directly, in the same SQLite file as the documents ([ADR 6](0006-sqlite-storage.md)), and creates its tables at startup.
  - Public sign-up is off (`disableSignUp`). First-run setup creates the admin with `createUser`, and is refused once any account exists.
  - Passwords use Better Auth's default scrypt hashing.
  - Telemetry is turned off explicitly.
- **Every account has a placeholder email,** because Better Auth requires one: `<username>@users.invalid`, on a domain reserved so that it can never receive mail.
- **Sessions last a year and are extended on use** (`expiresIn` 365 days, `updateAge` 1 day). They are held in an `HttpOnly` cookie.
  - The PWA calls `GET /api/auth/get-session` over HTTP whenever it is online. That renews the cookie, which the WebSocket upgrade cannot do.
- **The sync endpoint checks the session before upgrading.** Without a valid session it answers 401, and no socket is opened.
- **Revoking a session closes its sockets at once.** The server keeps the open sockets for each session. Better Auth's `databaseHooks.session.delete.after` hook, which fires on sign-out and on admin revocation, closes them with code 4401.
- **Rate limiting is always on,** with its counters in SQLite. The client's IP is read from the reverse proxy's forwarded header (`advanced.ipAddress.ipAddressHeaders`), set for the HTTPS setup in use ([ADR 3](0003-pwa-client.md)).

## Evidence
- The server stack spike ([`research/09-server-stack-spike-findings.md`](../research/09-server-stack-spike-findings.md)), in `spikes/notes-server-stack-poc/`: 17 Vitest tests against real servers and Hocuspocus providers pass in three runs in a row. They cover:
  - setup, no public sign-up, and admin-only account creation
  - a 429 after repeated failed sign-ins
  - co-editing across a server restart, and 300 documents on one socket
  - a 401 before the upgrade without a session, or with a forged or expired one
  - a one-year `HttpOnly` cookie, a session idle for 200 days, and cookie renewal over HTTP
  - an admin's revocation and a sign-out each closing that session's open socket
- Mutation checks: removing the socket close on revocation fails both revocation tests.
- The whole spike server is about 270 lines and adds 25 runtime packages, none with native code or install scripts ([ADR 5](../../../../docs/adr/0005-typescript-and-node.md)).
- Better Auth's documentation: scrypt is the default hash, rate limiting is built in, and `node:sqlite` is supported as a database.

## Consequences
- Better Auth's tables (`user`, `session`, `account`, `verification`, `rateLimit`) live beside `documents` in the one SQLite file. Backing up that file still backs up the instance ([ADR 6](0006-sqlite-storage.md)). Better Auth stores dates there as ISO strings.
- Better Auth upgrades can change its schema. They are tested against an existing data directory before they are merged.
- Without the forwarded IP header, every client shares one rate-limit bucket, so one person's failed sign-ins would lock everyone out for the window. The deploy setup must set it.
- An open socket whose session expires without being deleted stays open until it reconnects. Sessions are extended on every use, so this only affects a device that stays connected for a whole year.
- Better Auth's organization and team plugins are not used for teamspaces or page sharing. Access is decided per document in the sync server, from the access rules ([ADR 13](0013-access-model.md)).
- Startup logs a harmless "Database schema mismatch" on a fresh data directory, before the tables are created.
- Hono's typed RPC client is available for the client's few API calls, so no separate RPC library is needed.
