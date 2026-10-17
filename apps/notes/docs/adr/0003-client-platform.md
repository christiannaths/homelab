# 3. What kind of client do people install?

- Status: Accepted
- Date: 2026-10-16
- Depends on: [ADR 1](0001-offline-use.md)
- Dependency of: [ADR 18](0018-http-and-accounts.md)

## Context
The target platforms are macOS and iOS, with a desktop-like experience on the Mac. Separate native apps would multiply the work, and the app must start without a network ([ADR 1](0001-offline-use.md)).

## Decision
- **One web app, installed as a Progressive Web App:**
  - macOS: Safari 17+ **File → Add to Dock** (installing from Chrome or Edge also works).
  - iOS: Safari **Add to Home Screen**.
- A service worker precaches the whole app shell, so the app starts with no network.
- The app requests persistent storage (`navigator.storage.persist()`).
- **The app is served over HTTPS with a certificate the devices trust**, even on a home network (for example `tailscale serve`, or Caddy with a DNS-01 challenge). `http://localhost` is acceptable for development on the same machine.

## Evidence
- PR #1: offline cold start works in Chromium. Multi-user editing works in two browsers on the Mac, and the app loads in Safari on an iPhone through `tailscale serve`.
- Plain `http://<LAN-IP>` does not work, because service workers and `crypto.randomUUID` need a secure context.
- Not yet confirmed on Apple devices: an offline cold start of the installed app, and how long Safari keeps stored data. Both are in the manual checklists of PR #1 and PR #2. If they fail, this ADR is revisited (for example by wrapping the app in Capacitor or Tauri), not quietly worked around.

## Consequences
- Safari has no background sync, so changes sync only while the app is open.
- There is no deep OS integration (menu bar, global shortcuts) for now.
- The same frontend can still be wrapped in Tauri (macOS) or Capacitor (iOS) without a rewrite. That would be a new ADR.
