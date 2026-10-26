# ADR-NOTE-014. How does the server handle HTTP requests and account security?

- Status: Accepted
- Date: 2026-10-23
- Depends on: [ADR-NOTE-003](ADR-NOTE-003-app-delivery.md), [ADR-NOTE-004](ADR-NOTE-004-hosting-and-scale.md), [ADR-NOTE-005](ADR-NOTE-005-document-persistence.md), [ADR-NOTE-009](ADR-NOTE-009-identity.md), [ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md), [ADR-NOTE-011](ADR-NOTE-011-access-control.md), [ADR-PLAT-001](../../../../docs/adr/ADR-PLAT-001-toolchain.md), [ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)
- Dependency of: none

## Context

The server needs a real HTTP API: the signed-in person, invites, people and roles, sharing, teamspaces and attachments. The homelab gateway asks the homelab's accounts service about every request before it reaches Notes, and passes the person on in `Remote-*` headers ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md), [ADR-NOTE-009](ADR-NOTE-009-identity.md)). The PWA serves itself from its cache, so a signed-out device must find out from the API before it shows what it kept. The Notes server stays one Node process with one SQLite file ([ADR-NOTE-004](ADR-NOTE-004-hosting-and-scale.md), [ADR-NOTE-005](ADR-NOTE-005-document-persistence.md)).

## Decision

- **Hono serves all HTTP**, on `@hono/node-server` with its built-in WebSocket support (`ws`, `WebSocketServer` with `noServer: true`). That covers the API, the built PWA with a fallback to `index.html`, and the sync endpoint. `@hono/node-ws` is deprecated and is not used.
- **Hocuspocus runs behind Hono** without a server of its own ([ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md)):
  - Hono's `upgradeWebSocket` passes each socket to `hocuspocus.handleConnection()`, with the signed-in person as the connection's context.
  - Hono forwards the socket's messages and close events to Hocuspocus.
  - Hocuspocus's `onRequest`, `onUpgrade` and `onListen` hooks are not used.
- **Every API request and sync upgrade reads the person from the gateway's headers.** `Remote-User` is the person's account id, `Remote-Name` the name and `Remote-Groups` the comma-separated groups, each percent-decoded. A request without `Remote-User` did not come through the gateway and is answered 401, and a sync upgrade without it opens no socket.
- **The PWA asks the server who is signed in** (`GET /api/session`, with `redirect: "manual"`) whenever it starts online or reconnects. A signed-out device gets the gateway's redirect to sign in instead of an answer, and goes to sign-in.
- **Sign-in is a page load the service worker does not answer** (`/api/sign-in`), so it reaches the gateway, which sends a signed-out browser to the accounts service's sign-in page and back.
- **The server has no sign-out route.** Signing out is the App switcher's, which goes to the accounts service's `/sign-out` itself ([ADR-NOTE-009](ADR-NOTE-009-identity.md)).

## Alternatives considered

- **An OIDC client with Notes' own device sessions.** Built first (PR #66): an authorization-code flow with PKCE checked with `jose`, and year-long session cookies whose revocation closed their sockets. A sign-out made elsewhere could not reach it ([ADR-NOTE-009](ADR-NOTE-009-identity.md)).
- **A network-first service worker for page loads,** as in the ProxyAuth spike, so the gateway's redirect is seen on every page load. The session check already sees it, and a cache-first shell opens at once on a slow connection.
- **A full-stack framework.** Every read is local and the server cannot query Yjs data, so it would add little ([`research/08-framework-options.md`](../research/08-framework-options.md)).
- **Hocuspocus's `onRequest` hook with a hand-written static file server,** as the first spike did ([ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md)).
- **Better Auth for accounts and sessions.** With the gateway signing people in, Notes has no accounts or sessions to manage.

## Evidence

- The server stack spike ([`research/09-server-stack-spike-findings.md`](../research/09-server-stack-spike-findings.md)), in `spikes/notes-server-stack-poc/`: static files and the client-side route fallback, co-editing across a server restart, and 300 documents on one socket.
- The ProxyAuth spike ([`spikes/voidauth-proxyauth-poc/FINDINGS.md`](../../../../spikes/voidauth-proxyauth-poc/FINDINGS.md)): the gateway's redirect reaching a page's `fetch` as an `opaqueredirect`, and a WebSocket upgrade passing through the gateway with the person on it.
- Notes' server tests (`apps/notes/server/test/`) and end-to-end suite (`apps/notes/e2e/`), the latter in Chromium behind a stand-in front door that answers a signed-out `fetch` with a redirect, as the gateway does (issue #126). The platform's end-to-end suite opens Notes and its sync socket through the real gateway and accounts service (`platform/e2e/tests/notes.test.ts`).

## Consequences

- Notes must only be reachable through the gateway, which deletes any `Remote-*` headers the browser sent. Anyone who reaches the server directly can claim to be anyone.
- Signing in on a new device, and every request online, needs the accounts service to be running. The PWA treats a failed request as offline and keeps working from what it kept.
- An open socket stays open after its person signs out elsewhere, until it reconnects ([ADR-NOTE-009](ADR-NOTE-009-identity.md)).
- Access is decided per document in the sync server, from the access rules ([ADR-NOTE-011](ADR-NOTE-011-access-control.md)).

## Changelog

- 2026-10-23: `Remote-User` is the person's account id from the homelab's own accounts service instead of a VoidAuth username, and signing in and out go to its pages, since the accounts service replaced VoidAuth ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md), issue #111, spec #110).
- 2026-10-22: `/api/sign-out` is removed, since signing out moved to the App switcher, the same in every app ([ADR-NOTE-009](ADR-NOTE-009-identity.md), issue #89).
- 2026-10-19: The server reads the person from the homelab gateway's headers, instead of signing people in as an OIDC client and keeping its own device sessions. As an OIDC client, Notes could not learn of a sign-out made elsewhere ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md), PR #68).
- 2026-10-17: Notes signed people in through VoidAuth and kept only its own device sessions, instead of running Better Auth with its own accounts and rate limiting. Passwords moved to the homelab's shared sign-in ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)).
- 2026-10-17: Accepted. Hono served HTTP with Hocuspocus behind it, and Better Auth managed username accounts, scrypt passwords, year-long sessions and rate limiting in the same SQLite file.
