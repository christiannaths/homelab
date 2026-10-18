# ADR-ENCY-001. How does an install get Wikipedia's content?

- Status: Accepted
- Date: 2026-10-18
- Depends on: [ADR-PLAT-005](../../../../docs/adr/ADR-PLAT-005-app-settings.md)
- Dependency of: [ADR-ENCY-002](ADR-ENCY-002-article-serving.md), [ADR-ENCY-003](ADR-ENCY-003-licensing.md), [ADR-ENCY-004](ADR-ENCY-004-identity.md), [ADR-ENCY-005](ADR-ENCY-005-offline-use.md), [ADR-ENCY-006](ADR-ENCY-006-article-presentation.md)

## Context

Encyclopedia is a read-only copy of Wikipedia that anyone can install and that is already populated with content. Nobody edits it. Rendering Wikipedia from Wikimedia's XML dumps takes thousands of templates, Lua modules and a long database import, and the dumps carry no images or search index. Kiwix already publishes every Wikipedia as a single ZIM file, rebuilt about monthly, holding rendered HTML, images and title and full-text indexes. English is large (the last maxi file found was about 111 GB), so a first download can take hours.

## Decision

- **Content is a Kiwix Wikipedia ZIM file.** Encyclopedia serves Wikipedia only, not other ZIM content such as Wiktionary or Stack Exchange.
- **Articles are read-only.** There is no editing, history or talk pages.
- **The app downloads the file itself** from Kiwix's OPDS catalog. The homelab admin picks a language and a size (maxi, nopic or mini, or a topic subset) in Encyclopedia's own settings screen.
- **An install holds one language.**
- **A new install starts with a small starter file**, such as the most-read articles, so people can read at once. The admin's full pick downloads in the background and replaces the starter when it is complete.
- **The app keeps the content current.** It checks the catalog for a newer file each month, downloads it in the background, and swaps it in only once the download is complete and verified. Readers never see a half-downloaded file.
- **The content choice is app data, not an installer setting.** It lives in the app's data directory and is changed in the app. Deployment settings stay environment variables ([ADR-PLAT-005](../../../../docs/adr/ADR-PLAT-005-app-settings.md)).

## Alternatives considered

- **MediaWiki with Wikimedia's XML dump.** It is what Wikipedia runs and allows editing, but editing is not wanted. The import takes days or longer, needs a PHP stack, and still lacks images and search.
- **The installer downloads the file and drops it in a folder.** It is simpler to build, but every installer has to find, download and later replace a file of up to 100 GB by hand.
- **No starter file.** The app would show only "downloading" for hours after install, which defeats "already populated".
- **Several languages per install.** It is left for later: one language keeps search, lists and updates simple.

## Evidence

- Survey of the open source options: [`research/01-foss-landscape.md`](../research/01-foss-landscape.md).
- ZIM flavours, contents, catalog and update cadence: [`research/02-zim-and-libzim.md`](../research/02-zim-and-libzim.md). Sizes and dates there come from secondary sources, because Kiwix's hosts were unreachable from the research environment.
- Product decisions by Christian, 2026-10-18, in the project thread: read-only, Wikipedia only, the app downloads and updates the file, a starter file, one language.

## Consequences

- The server needs disk space for two files during an update: the current one and the one downloading.
- An update replaces the whole file, because ZIM files have no incremental updates.
- Article titles can change between files, which saved lists must handle (see the saved lists spec).
- Encyclopedia depends on Kiwix continuing to publish Wikipedia ZIM files. If it stops, the last downloaded file keeps working.
- The settings screen for the content choice is the first in-app admin setting in the homelab. If more apps need them, an in-app settings pattern becomes a platform decision.
