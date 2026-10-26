# Home

The page every homelab account can open. It shows the apps a person can use as tiles.

Part of the [platform](../../docs/adr/ADR-PLAT-002-repo-structure.md) in the [homelab monorepo](../../README.md): it shows a person's App access across every app, and an install can leave it out. Without Home, every app still has the App switcher, which asks the accounts site, as Home's tiles do. Words such as **App access** and **App switcher** are defined in the root [`GLOSSARY.md`](../../GLOSSARY.md).

- [`server/`](server/README.md): serves the web client.
- [`web/`](web): the tiles, as an installable app that opens offline, with the [App switcher](../app-switcher/README.md) at the top, which the gateway adds. It gets the person and their apps from the accounts site's `/api/me` ([accounts service](../accounts/README.md)).
- The platform's end-to-end suite, [`platform/e2e/`](../e2e), crosses apps: Home, Notes and the Encyclopedia behind the real gateway and the accounts service.

How the accounts service finds a person's apps, and why every account reaches Home, is in [ADR-PLAT-004](../../docs/adr/ADR-PLAT-004-sign-in.md). Home keeps no data of its own, so it has no ADRs of its own yet.

## Adding an app to Home

Nothing changes in Home. An app shows up for everyone with **App access** to it once:

- it is served at `<app>.<parent domain>`, with its manifest at `/manifest.webmanifest` and its icons under `/icons/`;
- its subdomain is in the accounts service's installed apps (`HOMELAB_APPS`), so a homelab admin can give people App access to it.

Its manifest's `homelab` member says whether it opens offline: `"homelab": { "opens_offline": true }`. Without it, the app's tile and its App switcher entry are greyed out while the device is offline.
