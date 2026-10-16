# 4. The client is a PWA, installed on macOS and iOS

- Status: Accepted
- Date: 2026-10-16

## Context
The target platforms are **macOS and iOS**, with a desktop-like experience on the Mac. Native apps for each platform would multiply the work.

## Decision
- One web app, installed as a **Progressive Web App**:
  - macOS: Safari 17+ **File → Add to Dock** (Chrome and Edge installs also work)
  - iOS: Safari **Add to Home Screen**
- A service worker precaches the whole app shell, so the app starts with no network.
- The app asks for persistent storage (`navigator.storage.persist()`).
- **It must be served over HTTPS with a certificate the devices trust**, even on a home network (e.g. `tailscale serve`, or Caddy with a DNS-01 challenge). `http://localhost` is fine for development on the same machine.

## Evidence
- PR #1: offline cold start works in Chromium. Multi-user editing was confirmed in two browsers on the Mac, and the app loads in Safari on an iPhone through `tailscale serve`.
- **Not yet confirmed on Apple devices:** an installed (Home Screen or Dock) offline cold start, and how long Safari keeps the stored data. These are in PR #1's and PR #2's manual checklists. If they fail, this ADR gets revisited (e.g. by wrapping the app in Capacitor or Tauri), not quietly worked around.
- Plain `http://<LAN-IP>` doesn't work: service workers and `crypto.randomUUID` need a secure context.

## Consequences
- Safari doesn't support background sync, so changes sync only while the app is open.
- There's no deep OS integration (menu bar, global shortcuts) for now.
- Wrapping the same frontend in Tauri (macOS) or Capacitor (iOS) stays possible without a rewrite. That would be a new ADR if it's ever needed.
