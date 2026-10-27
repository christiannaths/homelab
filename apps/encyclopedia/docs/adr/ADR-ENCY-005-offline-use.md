# ADR-ENCY-005. How does the app keep working without a network?

- Status: Accepted
- Date: 2026-10-18
- Depends on: [ADR-ENCY-001](ADR-ENCY-001-content-source.md), [ADR-ENCY-002](ADR-ENCY-002-article-serving.md), [ADR-ENCY-004](ADR-ENCY-004-identity.md)
- Dependency of: none

## Context

Homelab apps are installed PWAs that work with no network. English Wikipedia is 55–110 GB, too big for phones, and browsers can't read the server's file remotely ([ADR-ENCY-002](ADR-ENCY-002-article-serving.md)). People still expect what they kept, and just read, to be there offline.

## Decision

- **Installed PWA that opens offline**, signed in ([ADR-ENCY-004](ADR-ENCY-004-identity.md)).
- **Saved articles kept on device**, images included, while on any of the person's lists.
- **Recently read kept too**, oldest cleared first when the device needs room; saved articles never cleared for room. No fixed count.
- **Saved articles follow content updates** ([ADR-ENCY-001](ADR-ENCY-001-content-source.md)): refreshed to current text; renamed or deleted ones keep the old copy, flagged.
- **Offline search covers only on-device articles** (saved + recent); online covers everything ([ADR-ENCY-002](ADR-ENCY-002-article-serving.md)).
- **Saved lists editable offline**; changes reach the server and other devices when next online.

## Alternatives considered

- **Whole encyclopedia per device** (Kiwix app): up to 110 GB; phones can't hold it.
- **Fixed recent cap** (e.g. 100): space-based clearing keeps more where there's room and never removes saved ones.
- **Saved articles frozen** like clippings: drift from what the person searches.
- **All titles on device for offline search**: ~50 MB download, est. 150–300 MB stored (English), for results that can't open offline. Skipped for now.

## Evidence

- Sizes; no remote ZIM reads: [`research/02-zim-and-libzim.md`](../research/02-zim-and-libzim.md).
- Christian, 2026-10-18, project thread.
- Nothing built. iOS PWA data retention unconfirmed, as for Notes.

## Consequences

- Saving an article is how it goes offline.
- The app asks for persistent storage, so the browser doesn't clear it.
- Each monthly update makes every device refresh saved articles (bandwidth).
