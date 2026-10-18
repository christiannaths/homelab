# ADR-ENCY-006. How do articles look inside the homelab?

- Status: Accepted
- Date: 2026-10-18
- Depends on: [ADR-ENCY-001](ADR-ENCY-001-content-source.md), [ADR-ENCY-002](ADR-ENCY-002-article-serving.md), [ADR-ENCY-003](ADR-ENCY-003-licensing.md)
- Dependency of: none

## Context

ZIM files carry Wikipedia's rendered HTML and styling ([ADR-ENCY-001](ADR-ENCY-001-content-source.md)). People know Wikipedia's article layout: infoboxes, tables, references. Encyclopedia sits beside other homelab apps, such as Notes, and should feel like part of the same set, dark mode included. Article text must not change ([ADR-ENCY-003](ADR-ENCY-003-licensing.md)).

## Decision

- **The app's own screens use the homelab's look:** search, saved lists, menus and settings.
- **Articles keep Wikipedia's layout,** with infoboxes, tables and references where Wikipedia puts them, restyled in the homelab's fonts and colours, with dark mode.
- **Restyling changes styles only,** never article text or structure, and the attribution footer stays visible ([ADR-ENCY-003](ADR-ENCY-003-licensing.md)).

## Alternatives considered

- **Articles exactly as Wikipedia shows them.** Less work, but out of place next to the other apps and without dark mode.
- **Articles rebuilt into the homelab's own layout.** It would lose Wikipedia's familiar structure and risks changing content.

## Evidence

- Product decision by Christian, 2026-10-18, in the project thread.
- Nothing has been built yet. How well Wikipedia's HTML takes a new stylesheet, notably in dark mode, is untested.

## Consequences

- The app ships a stylesheet for Wikipedia's article HTML, which may need fixing when Kiwix changes how it renders articles.
- The homelab's shared look (fonts, colours, dark mode) has to exist as something both Notes and Encyclopedia use.
