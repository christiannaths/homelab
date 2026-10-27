# Home

Tiles for the apps a person can use; open to every homelab account. Platform, not an app, since it shows App access across apps; optional per install (the App switcher works without it). Access rules: [ADR-PLAT-004](../../docs/adr/ADR-PLAT-004-sign-in.md). No data, so no ADRs yet.

| Part |  |
| --- | --- |
| [`server/`](server/README.md) | Serves the web client |
| [`web/`](web) | Offline-capable PWA; reads `/api/me` ([accounts](../accounts/README.md)) via [`@homelab/signed-in-state`](../../packages/signed-in-state), which keeps the last answer for offline opens |
| [`platform/e2e/`](../e2e) | Cross-app suite: Home, Notes, Encyclopedia behind the real gateway and accounts service |

## Adding an app to Home

No Home change. An app appears for people with App access once it serves the [app contract](../../docs/adr/ADR-PLAT-009-app-contract.md) at `<app>.<parent domain>` and is in `HOMELAB_APPS`. Without `"homelab": { "opens_offline": true }` in its manifest, its tile and switcher entry grey out offline.
