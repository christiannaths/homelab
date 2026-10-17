# Requirements & early decisions

## Answers so far

1. **Databases are in the MVP**: Notion-style tables plus other views.
2. **Platforms: iOS and macOS**, with a desktop-like experience on macOS.
3. **Deployment: homelab.** Each install is private and serves a handful of trusted users.

## Platform approach: PWA first

- **macOS**: Safari 17+ (Sonoma and later) has _File → Add to Dock_. The app gets its own window, Dock icon and Cmd-Tab entry, with no browser UI and storage kept separate from Safari. Chrome and Edge can also install PWAs on macOS.
- **iOS**: _Add to Home Screen_ runs the app standalone. Web Push works on iOS 16.4+.
- **Offline**: a service worker caches the app shell, and IndexedDB stores the Yjs documents and metadata. Home-screen web apps aren't subject to Safari's 7-day eviction of script-written storage. We'll still call `navigator.storage.persist()`.
- **Limits to design around**
  - Safari has no Background Sync API, so sync only runs while the app is open.
  - It requires **HTTPS with a certificate the devices trust**, even on a LAN. Options: Caddy with a DNS-01 challenge, Tailscale certificates, or a Cloudflare tunnel.
  - Keyboard-shortcut and menu-bar integration is limited.
- **Fallback if needed**: wrap the same web app in **Tauri** on macOS (system WebView, small binary) or **Capacitor** on iOS. Neither requires rewriting the frontend.

## What the homelab scope simplifies

- No multi-tenancy, billing or SSO at the start. A handful of local accounts with simple per-workspace and per-page sharing.
- We trust the server, so no E2EE. The server can index content for search.
- One `docker compose up` with a single app container plus storage. SQLite or Postgres on the server both work at this scale.
- Offline permission conflicts barely matter with a few trusted users. The server checks permissions when edits sync.
