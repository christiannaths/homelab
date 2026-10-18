# ADR-NOTE-004. How is the app hosted, and for how many people?

- Status: Accepted
- Date: 2026-10-17
- Depends on: [ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)
- Dependency of: [ADR-NOTE-001](ADR-NOTE-001-offline-use.md), [ADR-NOTE-005](ADR-NOTE-005-document-persistence.md), [ADR-NOTE-009](ADR-NOTE-009-identity.md), [ADR-NOTE-014](ADR-NOTE-014-http-and-accounts.md)

## Context
LocalNotion is meant for private, self-hosted instances. Each instance serves a handful of people who trust each other and the server.

## Decision
- **One server process runs in one container** (`docker compose up`). It serves the PWA, relays sync and stores data. Its only outside service is the homelab's shared sign-in ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)).
- **One install is one private instance.** There is no multi-tenancy, billing or public sign-up.
- **There is no end-to-end encryption.** The server is trusted and may read content, for example for search or backups. Transport is HTTPS.
- All data lives in one data directory (`DATA_DIR`). Backing up that directory backs up the instance.

## Evidence
- Stated requirements ([`research/02-requirements.md`](../research/02-requirements.md)).
- PR #1: the Docker image builds and runs on `node:26-slim`, serving the app and sync from one process.

## Consequences
- The scale target is hundreds to low thousands of pages, and databases of thousands of rows, for a few users. Other decisions rely on that, for example syncing everything a person can open, up to the whole workspace, to each of their devices ([ADR-NOTE-001](ADR-NOTE-001-offline-use.md)).
- Security relies on network access control (Tailscale, LAN, reverse proxy) plus sign-in ([ADR-NOTE-009](ADR-NOTE-009-identity.md)), not on encryption at rest.

## Changelog
- 2026-10-17: The server relies on the homelab's shared sign-in, VoidAuth, instead of running with no outside services. Every homelab app now signs people in through it ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)).
- 2026-10-16: Accepted. One server process in one container, with no external services.
