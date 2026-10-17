# 4. Each instance is a self-hosted homelab server for a few trusted users

- Status: Accepted
- Date: 2026-10-16
- Depends on: none
- Dependency of: [ADR 1](0001-works-offline.md), [ADR 6](0006-sqlite-server-storage.md), [ADR 11](0011-local-password-accounts.md), [ADR 18](0018-works-offline-on-what-its-person-can-open.md), [ADR 20](0020-hono-http-and-better-auth-accounts.md)

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
- The scale target is hundreds to low thousands of pages, and databases of thousands of rows, for a few users. Other decisions rely on that, for example syncing the whole workspace to each device ([ADR 1](0001-works-offline.md)).
- Security relies on network access control (Tailscale, LAN, reverse proxy) plus app accounts ([ADR 11](0011-local-password-accounts.md)), not on encryption at rest.
