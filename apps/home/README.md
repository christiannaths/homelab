# Home

The app every homelab account can open. It shows the apps a person can use as tiles, and tells every app's App switcher who is signed in and which apps they have.

The `home` app in the [homelab monorepo](../../README.md). Words such as **App access** and **App switcher** are defined in the root [`GLOSSARY.md`](../../GLOSSARY.md).

- [`server/`](server/README.md): answers who is signed in and lists their apps, read from the gateway's headers and each app's manifest, and serves the web client.
- [`web/`](web): the tiles, as an installable app that opens offline, with the [App switcher](../../packages/app-switcher/README.md) in its header.
- [`e2e/`](e2e): end-to-end tests that cross apps: Home, Notes and the Encyclopedia behind the real gateway and VoidAuth.

How Home finds a person's apps, and why every account reaches it, is in [ADR-PLAT-004](../../docs/adr/ADR-PLAT-004-sign-in.md). Home keeps no data of its own, so it has no ADRs of its own yet.

## Adding an app to Home

Nothing changes in Home. An app shows up for everyone with **App access** to it once:

- it is served at `<app>.<parent domain>`, with its manifest at `/manifest.webmanifest` and its icons under `/icons/`;
- its VoidAuth groups are `<app>` and, if it has an admin level, `<app>-admins`, and its ProxyAuth domain is open to them.

Its manifest's `homelab` member says whether it opens offline: `"homelab": { "opens_offline": true }`. Without it, the app's tile and its App switcher entry are greyed out while the device is offline.
