# 9. BlockNote is the page editor, and Mantine is the UI library

- Status: Accepted
- Date: 2026-10-16
- Depends on: [ADR 2](0002-yjs-stores-shared-data.md), [ADR 7](0007-document-split.md)
- Dependency of: [ADR 11](0011-yjs-13-until-stack-supports-14.md)

## Context
A Notion-style block editor with live collaboration on Yjs ([ADR 2](0002-yjs-stores-shared-data.md)) is the largest single UI component, and building one from scratch is not worthwhile. BlockNote draws its menus and toolbars through one of three interchangeable UI packages: `@blocknote/mantine`, `@blocknote/shadcn` or `@blocknote/ariakit`. All three provide the same editor components, because `@blocknote/react` defines one component interface that each implements, so choosing between them is really choosing the UI library for the whole app. The goal is mostly default styles, adjusted at a high level: semantic colours, border radius, depth (shadows) and font, in light and dark.

## Decision
- **BlockNote edits page bodies** (`@blocknote/core`, `@blocknote/react`; MPL-2.0). It is bound to the page doc's `content` fragment ([ADR 7](0007-document-split.md)) through `@blocknote/core/yjs`.
- **BlockNote's "XL" packages are not used** (GPL-3.0 or commercial; for example PDF or DOCX export, or AI). Features like those need another implementation.
- **Mantine is the UI library for the whole client:** the editor's menus (`@blocknote/mantine`) and the app's own UI (`@mantine/core`, `@mantine/hooks`, plus Mantine add-on packages such as `dates`, `spotlight`, `notifications` and `modals` as features need them). No second component library is added.
- **One set of design tokens styles both.** The app defines semantic tokens once (colours, radius, elevation and font, for light and dark). Those tokens feed Mantine's theme and BlockNote's `--bn-*` variables, so the editor and the app always match.
- The client UI uses **React**, which BlockNote and Mantine require.

## Evidence
- PR #1: live co-editing, cursors and presence, offline edits merging inside a paragraph, and server persistence.
- PR #2: database row pages reuse the same editor.
- Theming, comparing the CSS the three packages ship (v0.56):
  - All three follow BlockNote's variables for colours and radius.
  - `@blocknote/mantine` also routes depth through the shared variables (`--bn-shadow-light` and `--bn-shadow-medium`, used in about 10 places). It is also the only one with a typed `theme` prop for light and dark.
  - `@blocknote/ariakit` hard-codes most shadows, so changing depth means per-class overrides.
  - `@blocknote/shadcn` takes depth from Tailwind classes inside its components.
- Component breadth for the rest of the app:
  - Mantine 9 has about 100 components (281 exported parts) plus add-ons, including a drawer (for the phone sidebar), a ⌘K command palette, date pickers, multi-select and tags inputs, toasts, context menus, modals, file drop zones, a tree and charts.
  - shadcn/ui has 59 components and needs Tailwind across the whole app.
  - Ariakit has about 27 unstyled primitives, with no date picker, toasts or drawer.

## Consequences
- The page-body format is BlockNote's ProseMirror schema stored in Yjs. Markdown import and export go through BlockNote's conversion helpers.
- BlockNote upgrades can include schema migrations, which need testing against existing docs.
- Mantine upgrades stay within the versions `@blocknote/mantine` supports (currently `^8.3.11 || ^9.0.2`).
- Mantine is the heaviest of the three options (extra JavaScript, plus CSS on first load). Using it for the app UI as well as the editor is what makes that weight worthwhile. The PWA caches it after the first load.
- High-level theming covers colours, radius, depth and font. Anything finer means overriding Mantine's or BlockNote's CSS classes (`.bn-*`), which are not a stable public API, so such overrides stay few and are re-checked on upgrades.
- The existing hand-styled UI (sidebar, database table, trash, diagnostics) moves to Mantine components as each part is next worked on, not in one rewrite.
