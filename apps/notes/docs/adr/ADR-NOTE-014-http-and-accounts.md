# ADR-NOTE-014. How does the server handle HTTP requests and account security?

- Status: Accepted
- Date: 2026-10-23
- Depends on: [ADR-NOTE-003](ADR-NOTE-003-app-delivery.md), [ADR-NOTE-004](ADR-NOTE-004-hosting-and-scale.md), [ADR-NOTE-005](ADR-NOTE-005-document-persistence.md), [ADR-NOTE-009](ADR-NOTE-009-identity.md), [ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md), [ADR-NOTE-011](ADR-NOTE-011-access-control.md), [ADR-PLAT-001](../../../../docs/adr/ADR-PLAT-001-toolchain.md), [ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md), [ADR-PLAT-009](../../../../docs/adr/ADR-PLAT-009-app-contract.md)
- Dependency of: none

## Context

The server needs an HTTP API (session, invites, people, sharing, teamspaces, attachments) in one Node process with one SQLite file ([ADR-NOTE-004](ADR-NOTE-004-hosting-and-scale.md), [ADR-NOTE-005](ADR-NOTE-005-document-persistence.md)). The gateway vets every request and passes the person in `Remote-*` headers ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md), [ADR-NOTE-009](ADR-NOTE-009-identity.md)). The PWA serves itself from cache ([ADR-NOTE-003](ADR-NOTE-003-app-delivery.md)), so it must ask the API whether it's signed out.

## Decision

- **Hono serves everything** (API, PWA with `index.html` fallback, sync) on `@hono/node-server` with built-in WebSockets (`ws`, `WebSocketServer` with `noServer: true`); deprecated `@hono/node-ws` unused.
- **Hocuspocus runs behind Hono** ([ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md)): `upgradeWebSocket` hands each socket to `hocuspocus.handleConnection()` with the person as context, and Hono forwards messages and closes. `onRequest`, `onUpgrade`, `onListen` unused.
- **Identity from headers** on every request and upgrade, percent-decoded: `Remote-User` (account id), `Remote-Name`, `Remote-Groups` (comma-separated). Without `Remote-User` (didn't pass the gateway): API → 401, upgrade → no socket.
- **Session check:** `GET /api/session` (`redirect: "manual"`) on start, reconnect and page visible, via `@homelab/signed-in-state` ([ADR-PLAT-009](../../../../docs/adr/ADR-PLAT-009-app-contract.md)). A gateway redirect → forget the person, go to sign-in once the app can open offline. Unreachable or any non-person answer → keep the remembered person, offline.
- **Sign-in:** `/api/sign-in`, a page load the service worker skips, so the gateway sends a signed-out browser to the accounts service and back.
- **No sign-out route;** the App switcher uses the accounts service's `/sign-out` ([ADR-NOTE-009](ADR-NOTE-009-identity.md)).

## Alternatives considered

- **OIDC client with own sessions** (PR #66: PKCE via `jose`, year-long cookies whose revocation closed sockets): missed sign-outs elsewhere.
- **Network-first service worker** (ProxyAuth spike): the session check already sees the redirect, and cache-first opens instantly on slow links.
- **Full-stack framework:** reads are local and Yjs isn't queryable, so little gain ([`research/08-framework-options.md`](../research/08-framework-options.md)).
- **Hocuspocus `onRequest` + hand-written static server**, as the first spike.
- **Better Auth:** no accounts or sessions left to manage.

## Evidence

- Server stack spike ([`research/09-server-stack-spike-findings.md`](../research/09-server-stack-spike-findings.md), `spikes/notes-server-stack-poc/`) → static files and route fallback, co-editing across restart, 300 documents on one socket.
- ProxyAuth spike ([`spikes/voidauth-proxyauth-poc/FINDINGS.md`](../../../../spikes/voidauth-proxyauth-poc/FINDINGS.md)) → gateway redirect reaches `fetch` as `opaqueredirect`; WebSocket upgrades carry the person.
- `apps/notes/server/test/`, `apps/notes/e2e/` (stand-in front door redirecting signed-out `fetch`, #126) → the behaviour above.
- `platform/e2e/tests/notes.test.ts` → Notes and its socket through the real gateway and accounts service.

## Consequences

- Notes must be reachable only via the gateway, which strips browser-sent `Remote-*` headers; direct access means anyone can claim to be anyone.
- New-device sign-in and every online request need the accounts service; failures read as offline.
- Access is per document in the sync server ([ADR-NOTE-011](ADR-NOTE-011-access-control.md)).

## Changelog

- 2026-10-23: `Remote-User` is the homelab accounts service's account id, and sign-in/out use its pages; it replaced VoidAuth ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md), issue #111, spec #110).
- 2026-10-22: `/api/sign-out` removed for the App switcher ([ADR-NOTE-009](ADR-NOTE-009-identity.md), issue #89).
- 2026-10-19: Person from gateway headers instead of OIDC client sessions, which missed sign-outs elsewhere ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md), PR #68).
- 2026-10-17: VoidAuth sign-in with own device sessions instead of Better Auth accounts and rate limiting; passwords moved to the shared sign-in ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)).
- 2026-10-17: Accepted. Hono with Hocuspocus behind; Better Auth username accounts, scrypt, year-long sessions, rate limiting in the same SQLite file.
