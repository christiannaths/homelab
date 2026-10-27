# ADR-NOTE-007. How do people edit pages, and how is the interface built?

- Status: Accepted
- Date: 2026-10-16
- Depends on: [ADR-NOTE-002](ADR-NOTE-002-merging-edits.md)
- Dependency of: none

## Context

A collaborative block editor on Yjs ([ADR-NOTE-002](ADR-NOTE-002-merging-edits.md)) isn't worth building. BlockNote's menus come from one of three packages sharing one `@blocknote/react` interface, so picking one picks the app's UI library. Goal: default styles tuned at a high level (colours, radius, depth, font; light and dark).

## Decision

- **BlockNote edits page bodies** (`@blocknote/core`, `@blocknote/react`; MPL-2.0), bound via `@blocknote/core/yjs` to the body's Yjs XML fragment.
- **No "XL" packages** (GPL-3.0 or commercial: PDF/DOCX export, AI).
- **Mantine for the whole client:** `@blocknote/mantine`, `@mantine/core`, `@mantine/hooks`, plus add-ons (`dates`, `spotlight`, `notifications`, `modals`) as needed. No second component library.
- **One set of semantic tokens** feeds Mantine's theme and BlockNote's `--bn-*` variables.
- **React**, required by both.

## Alternatives considered

- **`@blocknote/shadcn` + shadcn/ui:** Tailwind app-wide; depth set by classes inside components.
- **`@blocknote/ariakit` + Ariakit:** ~27 unstyled primitives, no date picker, toasts or drawer; hard-coded shadows.

## Evidence

- PR #1 → co-editing, cursors, presence, in-paragraph offline merge.
- PR #2 → database rows reuse the editor.
- Shipped CSS (v0.56) → only `@blocknote/mantine` routes depth through shared variables (`--bn-shadow-light`, `--bn-shadow-medium`) and has a typed light/dark `theme` prop.
- Mantine 9 → ~100 components plus add-ons, incl. drawer, ⌘K palette, date pickers, toasts, modals, tree, charts.

## Consequences

- Body format is BlockNote's ProseMirror schema in Yjs; Markdown via its helpers; upgrades may migrate the schema.
- Mantine stays within `@blocknote/mantine`'s range (currently `^8.3.11 || ^9.0.2`).
- Mantine is the heaviest option; app-wide use justifies it.
- Finer theming overrides unstable `.bn-*`/Mantine classes: keep few, re-check on upgrades.
- Hand-styled UI moves to Mantine as each part is next touched.
