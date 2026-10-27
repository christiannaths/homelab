# ADR-NOTE-007. How do people edit pages, and how is the interface built?

- Status: Accepted
- Date: 2026-10-16
- Depends on: [ADR-NOTE-002](ADR-NOTE-002-merging-edits.md)
- Dependency of: none

## Context

A collaborative Notion-style block editor on Yjs ([ADR-NOTE-002](ADR-NOTE-002-merging-edits.md)) is the biggest UI piece and not worth building. BlockNote's menus come from one of three packages implementing one `@blocknote/react` interface, so picking one picks the app's UI library. Goal: default styles tuned at a high level (colours, radius, depth, font; light and dark).

## Decision

- **BlockNote edits page bodies** (`@blocknote/core`, `@blocknote/react`; MPL-2.0), bound to the body's Yjs XML fragment via `@blocknote/core/yjs`.
- **No BlockNote "XL" packages** (GPL-3.0 or commercial: PDF/DOCX export, AI); such features need another implementation.
- **Mantine for the whole client:** editor menus (`@blocknote/mantine`) and app UI (`@mantine/core`, `@mantine/hooks`, add-ons like `dates`, `spotlight`, `notifications`, `modals` as needed). No second component library.
- **One set of semantic tokens** (colours, radius, elevation, font; light/dark) feeds Mantine's theme and BlockNote's `--bn-*` variables.
- **React**, required by both.

## Alternatives considered

- **`@blocknote/shadcn` + shadcn/ui:** 59 components; Tailwind app-wide; depth from Tailwind classes inside components.
- **`@blocknote/ariakit` + Ariakit:** ~27 unstyled primitives; no date picker, toasts or drawer; shadows mostly hard-coded.

## Evidence

- PR #1 → co-editing, cursors, presence, in-paragraph offline merge, persistence.
- PR #2 → database row pages reuse the editor.
- Shipped CSS (v0.56) → all three use BlockNote's colour/radius variables; only `@blocknote/mantine` routes depth through them (`--bn-shadow-light`, `--bn-shadow-medium`, ~10 places) and has a typed light/dark `theme` prop.
- Mantine 9 → ~100 components (281 exports) plus add-ons: drawer, ⌘K palette, date pickers, multi-select/tags, toasts, context menus, modals, drop zones, tree, charts.

## Consequences

- Body format: BlockNote's ProseMirror schema in Yjs; Markdown via BlockNote's helpers. Upgrades may migrate the schema; test against existing docs.
- Mantine stays within `@blocknote/mantine`'s range (currently `^8.3.11 || ^9.0.2`).
- Mantine is the heaviest option; app-wide use justifies it, and the PWA caches it.
- Finer theming means overriding `.bn-*` or Mantine classes (not stable API): keep few, re-check on upgrades.
- Hand-styled UI (sidebar, database table, trash, diagnostics) moves to Mantine as each part is next touched.
