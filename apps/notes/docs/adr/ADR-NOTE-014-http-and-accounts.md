# ADR-NOTE-014. How does the server handle HTTP requests and account security?

- Status: Accepted
- Date: 2026-10-17
- Depends on: [ADR-NOTE-003](ADR-NOTE-003-app-delivery.md), [ADR-NOTE-004](ADR-NOTE-004-hosting-and-scale.md), [ADR-NOTE-005](ADR-NOTE-005-document-persistence.md), [ADR-NOTE-009](ADR-NOTE-009-identity.md), [ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md), [ADR-NOTE-011](ADR-NOTE-011-access-control.md), [ADR-PLAT-001](../../../../docs/adr/ADR-PLAT-001-toolchain.md), [ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)
- Dependency of: none

## Context

The server needs a real HTTP API: sign-in, invites, people and roles, sharing, teamspaces and attachments. People sign in through the homelab's VoidAuth ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)), and Notes keeps its own device sessions on top ([ADR-NOTE-009](ADR-NOTE-009-identity.md)). Those sessions must last while a device is offline, be revocable at once, and gate the sync socket. The Notes server stays one Node process with one SQLite file ([ADR-NOTE-004](ADR-NOTE-004-hosting-and-scale.md), [ADR-NOTE-005](ADR-NOTE-005-document-persistence.md)).

## Decision

- **Hono serves all HTTP**, on `@hono/node-server` with its built-in WebSocket support (`ws`, `WebSocketServer` with `noServer: true`). That covers the API, the built PWA with a fallback to `index.html`, and the sync endpoint. `@hono/node-ws` is deprecated and is not used.
- **Hocuspocus runs behind Hono** without a server of its own ([ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md)):
  - Hono's `upgradeWebSocket` passes each socket to `hocuspocus.handleConnection()`, with the signed-in person as the connection's context.
  - Hono forwards the socket's messages and close events to Hocuspocus.
  - Hocuspocus's `onRequest`, `onUpgrade` and `onListen` hooks are not used.
- **Sign-in is an OIDC authorization-code flow with PKCE** against VoidAuth, and the ID token is checked with `jose`. Notes requests the `groups` scope to recognise VoidAuth admins ([ADR-NOTE-009](ADR-NOTE-009-identity.md)).
- **Device sessions are Notes' own**, stored in the same SQLite file as the documents ([ADR-NOTE-005](ADR-NOTE-005-document-persistence.md)):
  - Each session is a random token in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie. Only a hash of the token is stored.
  - A session lasts a year and is extended on use (365 days, renewed at most once a day).
  - The PWA calls a session-check endpoint over HTTP whenever it is online. That renews the cookie, which the WebSocket upgrade cannot do.
- **The sync endpoint checks the session before upgrading.** Without a valid session it answers 401, and no socket is opened.
- **Revoking a session closes its sockets at once.** The server keeps the open sockets for each session, and signing out, revoking a device or removing a person closes them with code 4401.

## Alternatives considered

- **A full-stack framework.** Every read is local and the server cannot query Yjs data, so it would add little ([`research/08-framework-options.md`](../research/08-framework-options.md)).
- **Hocuspocus's `onRequest` hook with a hand-written static file server,** as the first spike did ([ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md)).
- **Better Auth for accounts and sessions.** With passwords in VoidAuth, Notes needs only device sessions, and Better Auth would bring its user, account and rate-limit tables and 25 packages for them.
- **An OIDC client library.** The flow is one redirect and one token request, and `jose` already checks the token.

## Evidence

- The server stack spike ([`research/09-server-stack-spike-findings.md`](../research/09-server-stack-spike-findings.md)), in `spikes/notes-server-stack-poc/`: 17 Vitest tests against real servers and Hocuspocus providers pass in three runs in a row. Those that do not depend on Better Auth cover:
  - static files and the client-side route fallback
  - co-editing across a server restart, and 300 documents on one socket
  - a 401 before the upgrade without a session, or with a forged or expired one
  - a one-year `HttpOnly` cookie, a session idle for 200 days, and cookie renewal over HTTP
  - revocation and sign-out each closing that session's open socket, and mutation checks confirming the revocation tests catch its removal
- The VoidAuth spike ([`spikes/voidauth-sso-poc/FINDINGS.md`](../../../../spikes/voidauth-sso-poc/FINDINGS.md)): the authorization-code flow with PKCE on `fetch` and `jose`, a device cookie renewed on sync, and a sync socket refused without it.

## Consequences

- Notes' session table lives beside `documents` in the one SQLite file, so backing up that file still backs up the instance ([ADR-NOTE-005](ADR-NOTE-005-document-persistence.md)).
- Signing in on a new device needs VoidAuth to be running. Signed-in devices keep syncing while it is down.
- An open socket whose session expires without being revoked stays open until it reconnects. Sessions are extended on every use, so this affects only a device that stays connected for a whole year.
- Better Auth's organization and team features are not used for anything. Access is decided per document in the sync server, from the access rules ([ADR-NOTE-011](ADR-NOTE-011-access-control.md)).

## Changelog

- 2026-10-17: Notes signs people in through VoidAuth and keeps only its own device sessions, instead of running Better Auth with its own accounts and rate limiting. Passwords moved to the homelab's shared sign-in ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)).
- 2026-10-17: Accepted. Hono served HTTP with Hocuspocus behind it, and Better Auth managed username accounts, scrypt passwords, year-long sessions and rate limiting in the same SQLite file.
