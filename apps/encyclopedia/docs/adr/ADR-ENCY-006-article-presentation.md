# ADR-ENCY-006. How do articles look inside the homelab?

- Status: Accepted
- Date: 2026-10-18
- Depends on: [ADR-ENCY-001](ADR-ENCY-001-content-source.md), [ADR-ENCY-002](ADR-ENCY-002-article-serving.md), [ADR-ENCY-003](ADR-ENCY-003-licensing.md)
- Dependency of: none

## Context

ZIM files carry Wikipedia's rendered HTML and styles ([ADR-ENCY-001](ADR-ENCY-001-content-source.md)), whose layout (infoboxes, tables, references) people know. Encyclopedia should feel like part of the homelab set, dark mode included, and article text must not change ([ADR-ENCY-003](ADR-ENCY-003-licensing.md)).

## Decision

- **App screens** (search, lists, menus, settings) **use the homelab look.**
- **Articles keep Wikipedia's layout**, restyled in homelab fonts and colours, with dark mode.
- **Styles only**: never article text or structure; the attribution footer stays visible ([ADR-ENCY-003](ADR-ENCY-003-licensing.md)).

## Alternatives considered

- **Articles exactly as Wikipedia**: less work, but out of place and no dark mode.
- **Rebuilt into a homelab layout**: loses familiar structure; risks changing content.

## Evidence

- Christian, 2026-10-18, project thread.
- Nothing built; how Wikipedia's HTML takes a new stylesheet, especially dark, is untested.

## Consequences

- Ships a stylesheet for Wikipedia's HTML, which may break when Kiwix changes rendering.
- The shared look (fonts, colours, dark mode) must be something Notes and Encyclopedia both use.
