# 4. Who runs an instance, and for how many people?

- Status: Accepted
- Date: 2026-10-16
- Depends on: none
- Dependency of: [ADR 1](0001-offline-use.md), [ADR 6](0006-server-storage.md), [ADR 11](0011-sign-in.md), [ADR 18](0018-http-and-accounts.md)

## Context
LocalNotion is meant for private, self-hosted instances. Each instance serves a handful of people who trust each other and the server.

## Decision
- **One server process runs in one container** (`docker compose up`). It serves the PWA, relays sync and stores data, with no external services.
- **One install is one private instance.** There is no multi-tenancy, billing or public sign-up.
- **There is no end-to-end encryption.** The server is trusted and may read content, for example for search or backups. Transport is HTTPS.
- All data lives in one data directory (`DATA_DIR`). Backing up that directory backs up the instance.

## Evidence
- Stated requirements ([`research/02-requirements.md`](../research/02-requirements.md)).
- PR #1: the Docker image builds and runs on `node:26-slim`, serving the app and sync from one process.

## Consequences
- The scale target is hundreds to low thousands of pages, and databases of thousands of rows, for a few users. Other decisions rely on that, for example syncing everything a person can open, up to the whole workspace, to each of their devices ([ADR 1](0001-offline-use.md)).
- Security relies on network access control (Tailscale, LAN, reverse proxy) plus app accounts ([ADR 11](0011-sign-in.md)), not on encryption at rest.
