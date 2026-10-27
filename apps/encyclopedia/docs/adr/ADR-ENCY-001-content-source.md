# ADR-ENCY-001. How does an install get Wikipedia's content?

- Status: Accepted
- Date: 2026-10-18
- Depends on: [ADR-PLAT-005](../../../../docs/adr/ADR-PLAT-005-app-settings.md)
- Dependency of: [ADR-ENCY-002](ADR-ENCY-002-article-serving.md), [ADR-ENCY-003](ADR-ENCY-003-licensing.md), [ADR-ENCY-004](ADR-ENCY-004-identity.md), [ADR-ENCY-005](ADR-ENCY-005-offline-use.md), [ADR-ENCY-006](ADR-ENCY-006-article-presentation.md)

## Context

Encyclopedia is a read-only, pre-populated Wikipedia anyone can install. Wikimedia's XML dumps need thousands of templates, Lua modules and a long import, and carry no images or search index. Kiwix publishes each Wikipedia as one ZIM file (rendered HTML, images, title and full-text indexes), rebuilt about monthly; English maxi was last seen at ~111 GB, so a first download can take hours.

## Decision

- **Content: one Kiwix Wikipedia ZIM file.** Wikipedia only (no Wiktionary, Stack Exchange etc.).
- **Read-only:** no editing, history or talk pages.
- **The app downloads it** from Kiwix's OPDS catalog; the admin picks language and size (maxi, nopic, mini or a topic subset) in Encyclopedia's settings screen.
- **One language per install.**
- **Starter file first** (e.g. most-read articles) so people read at once; the full pick downloads in the background and replaces it when complete.
- **Monthly updates:** checks the catalog, downloads in the background, swaps in only once complete and verified. Readers never see a partial file.
- **Content choice is app data** in the app's data directory, changed in the app; deployment settings stay env vars ([ADR-PLAT-005](../../../../docs/adr/ADR-PLAT-005-app-settings.md)).

## Alternatives considered

- **MediaWiki + XML dump**: allows unwanted editing; import takes days, needs PHP, still no images or search.
- **Installer drops the file in a folder**: simpler, but every installer finds, downloads and replaces up to 100 GB by hand.
- **No starter file**: hours of "downloading" after install, defeating "already populated".
- **Several languages**: later; one keeps search, lists and updates simple.

## Evidence

- FOSS survey: [`research/01-foss-landscape.md`](../research/01-foss-landscape.md).
- ZIM flavours, catalog, cadence: [`research/02-zim-and-libzim.md`](../research/02-zim-and-libzim.md) (sizes and dates from secondary sources; Kiwix's hosts were unreachable).
- Christian, 2026-10-18, project thread: read-only, Wikipedia only, app downloads and updates, starter file, one language.

## Consequences

- Updates need disk for two files (current + downloading).
- Updates replace the whole file (ZIM has no incremental updates).
- Titles can change between files; saved lists must cope (saved lists spec).
- Depends on Kiwix publishing; if it stops, the last file keeps working.
- First in-app admin setting in the homelab; if more apps need them, an in-app settings pattern becomes a platform decision.
