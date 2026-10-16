# 5. Self-hosted homelab deployment for a handful of trusted users

- Status: Accepted
- Date: 2026-10-16

## Context
LocalNotion is meant for private, self-hosted instances. Each one serves a handful of people who trust each other and the server.

## Decision
- **One server process in one container** (`docker compose up`). It serves the PWA, relays sync and stores data. There are no external services.
- **One install is one private instance.** No multi-tenancy, billing or public sign-up.
- **No end-to-end encryption.** The server is trusted and may read content, e.g. for search or backups. Transport is HTTPS (ADR 4).
- Data lives in one data directory (`DATA_DIR`). Backing it up is enough to back up the instance.

## Evidence
- Stated requirements (`research/02-requirements.md`).
- PR #1: the Docker image builds and runs on `node:26-slim`, serving the app and sync from one process.

## Consequences
- Scale targets are hundreds to low thousands of pages, and databases of thousands of rows, for a few users. Designs may rely on that, e.g. by syncing the whole workspace to each device (ADR 2).
- Security relies on network access control (Tailscale, LAN, reverse proxy) plus app accounts, not on encryption at rest.
