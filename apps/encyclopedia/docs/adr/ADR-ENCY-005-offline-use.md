# ADR-ENCY-005. How does the app keep working without a network?

- Status: Accepted
- Date: 2026-10-18
- Depends on: [ADR-ENCY-001](ADR-ENCY-001-content-source.md), [ADR-ENCY-002](ADR-ENCY-002-article-serving.md), [ADR-ENCY-004](ADR-ENCY-004-identity.md)
- Dependency of: none

## Context

Homelab apps are installed PWAs that open and work with no network. A whole Wikipedia is 55 to 110 GB in English, too large to keep on every phone, and a browser cannot read the server's file remotely ([ADR-ENCY-002](ADR-ENCY-002-article-serving.md)). People still expect what they chose to keep, and what they just read, to be there offline.

## Decision

- **Encyclopedia is an installed PWA that opens with no network**, signed in ([ADR-ENCY-004](ADR-ENCY-004-identity.md)).
- **Saved articles are kept on the device**, images included, for as long as they are on one of the person's lists.
- **Recently read articles are kept on the device too.** When the device needs room, the oldest recently read articles are cleared first. Saved articles are never cleared to make room. There is no fixed count.
- **Saved articles follow content updates** ([ADR-ENCY-001](ADR-ENCY-001-content-source.md)). After an update, the device refreshes them to the current text. When an article was renamed or deleted, the device keeps its old copy and the app flags it.
- **Offline search finds only what is on the device:** saved and recently read articles. Online search covers the whole encyclopedia ([ADR-ENCY-002](ADR-ENCY-002-article-serving.md)).
- **Saved lists can be changed offline.** Changes reach the server and the person's other devices when the device is next online.

## Alternatives considered

- **The whole encyclopedia on each device,** as the Kiwix app does. Each device would need a copy of up to 110 GB, which phones cannot hold.
- **A fixed cap on recent articles,** such as the last 100. Space-based clearing keeps more on devices with room and never removes saved articles.
- **Saved articles frozen as saved,** like clippings. They would drift from the encyclopedia the person searches.
- **Every title kept on each device for offline search.** About 50 MB to download and an estimated 150 to 300 MB stored for English, for results that cannot be opened offline. Skipped for now.

## Evidence

- Sizes and the inability to read a ZIM file remotely: [`research/02-zim-and-libzim.md`](../research/02-zim-and-libzim.md).
- Product decisions by Christian, 2026-10-18, in the project thread.
- Nothing has been built yet. How long browsers keep a PWA's data on iOS is unconfirmed, as for Notes.

## Consequences

- Saving an article is also how a person takes it offline.
- The device needs storage that the browser does not clear on its own, so the app asks for persistent storage.
- A content update makes every device refresh its saved articles, which costs bandwidth after each monthly update.
