# ADR-NOTE-004. How is the app hosted, and for how many people?

- Status: Accepted
- Date: 2026-10-17
- Depends on: [ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)
- Dependency of: [ADR-NOTE-001](ADR-NOTE-001-offline-use.md), [ADR-NOTE-005](ADR-NOTE-005-document-persistence.md), [ADR-NOTE-009](ADR-NOTE-009-identity.md), [ADR-NOTE-014](ADR-NOTE-014-http-and-accounts.md)

## Context

Private, self-hosted instances, each for a handful of people who trust each other and the server.

## Decision

- **One process, one container** (`docker compose up`): PWA, sync relay, storage. Only outside service: the homelab sign-in ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)).
- **One install = one private instance.** No multi-tenancy, billing or public sign-up.
- **No end-to-end encryption.** The server is trusted and may read content (search, backups). Transport is HTTPS.
- All data in `DATA_DIR`; back it up to back up the instance.

## Evidence

- Requirements ([`research/02-requirements.md`](../research/02-requirements.md)).
- PR #1 → Docker image on `node:26-slim` serves app and sync from one process.

## Consequences

- Scale target: hundreds to low thousands of pages, databases of thousands of rows, a few users. Other decisions rely on it (e.g. full per-person sync, [ADR-NOTE-001](ADR-NOTE-001-offline-use.md)).
- Security = network access control (Tailscale, LAN, reverse proxy) plus sign-in ([ADR-NOTE-009](ADR-NOTE-009-identity.md)), not encryption at rest.

## Changelog

- 2026-10-17: Relies on the shared homelab sign-in, VoidAuth, instead of no outside services ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)).
- 2026-10-16: Accepted. One process in one container, no external services.
