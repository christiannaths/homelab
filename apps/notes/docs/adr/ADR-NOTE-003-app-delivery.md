# ADR-NOTE-003. How does the app reach people's Macs and iPhones?

- Status: Accepted
- Date: 2026-10-16
- Depends on: [ADR-NOTE-001](ADR-NOTE-001-offline-use.md)
- Dependency of: [ADR-NOTE-014](ADR-NOTE-014-http-and-accounts.md)

## Context

Targets: macOS (desktop-like) and iOS. The app must start offline ([ADR-NOTE-001](ADR-NOTE-001-offline-use.md)).

## Decision

- **One web app, installed as a PWA:** macOS via Safari 17+ **File → Add to Dock** (Chrome/Edge work too); iOS via Safari **Add to Home Screen**.
- A service worker precaches the whole shell; the app requests `navigator.storage.persist()`.
- **HTTPS with a certificate devices trust**, even at home (e.g. `tailscale serve`, Caddy with DNS-01). `http://localhost` is fine for local development.

## Alternatives considered

- **Native macOS and iOS apps:** multiplies the work.

## Evidence

- PR #1 → offline cold start in Chromium; multi-user editing in two Mac browsers; loads in iPhone Safari via `tailscale serve`.
- `http://<LAN-IP>` fails: service workers and `crypto.randomUUID` need a secure context.
- Unconfirmed: installed offline cold start on Apple devices, and Safari data retention (PR #1/#2 checklists). Failure would change this, e.g. to Capacitor or Tauri.

## Consequences

- No background sync in Safari: sync only while open.
- No deep OS integration (menu bar, global shortcuts) for now.
- Can still be wrapped in Tauri (macOS) or Capacitor (iOS) without a rewrite.
