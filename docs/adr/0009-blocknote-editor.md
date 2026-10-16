# 9. BlockNote is the page editor, and Mantine is the UI library

- Status: Accepted
- Date: 2026-10-16

## Context
- A Notion-style block editor with live collaboration on Yjs is the largest single UI component. Building one from scratch isn't worthwhile.
- BlockNote draws its menus and toolbars through one of three interchangeable UI packages: `@blocknote/mantine`, `@blocknote/shadcn` or `@blocknote/ariakit`. All three provide the same editor components, because `@blocknote/react` defines one component interface that each must implement. Choosing between them is really choosing the UI library for the whole app.
- We want to use mostly default styles, but adjust the look at a high level: semantic colours, border radius, depth (shadows) and font, in light and dark.

## Decision
- Page bodies are edited with **BlockNote** (`@blocknote/core`, `@blocknote/react`; MPL-2.0). It's bound to the page doc's `content` fragment through `@blocknote/core/yjs`.
- **We don't use BlockNote's "XL" packages** (GPL-3.0 or commercial; e.g. PDF/DOCX export or AI). Features like those need another implementation.
- **Mantine is the UI library for the whole client:** the editor's menus (`@blocknote/mantine`) and the app's own UI (`@mantine/core`, `@mantine/hooks`, plus Mantine add-on packages such as `dates`, `spotlight`, `notifications` and `modals` as features need them). We don't add a second component library.
- **One set of design tokens styles both.** The app defines semantic tokens once (colours, radius, elevation, font, for light and dark). Those tokens feed Mantine's theme and BlockNote's `--bn-*` variables, so the editor and the app always match.
- The client UI uses **React**, which BlockNote and Mantine require.

## Evidence
- PR #1: live co-editing, cursors and presence, offline edits merging inside a paragraph, and server persistence.
- PR #2: row pages reuse the same editor.
- **Theming**, comparing the CSS the three packages ship (v0.56):
  - All three follow BlockNote's variables for colours and radius.
  - `@blocknote/mantine` also routes **depth** through the shared variables (`--bn-shadow-light`/`-medium`, used in about 10 places). It's also the only one with a typed `theme` prop for light and dark.
  - `@blocknote/ariakit` hard-codes most shadows, so changing depth there means per-class overrides.
  - `@blocknote/shadcn` takes depth from Tailwind classes inside its components.
- **Component breadth for the rest of the app:**
  - Mantine 9 has about 100 components (281 exported parts) plus add-ons. Among them: a drawer (for the phone sidebar), a ⌘K command palette, date pickers, multi-select and tags inputs, toasts, context menus, modals, file drop zones, a tree, and charts.
  - shadcn/ui has 59 components and needs Tailwind across the whole app.
  - Ariakit has about 27 unstyled primitives, with no date picker, toasts or drawer.

## Consequences
- The page-body format is BlockNote's ProseMirror schema stored in Yjs. Markdown import and export must go through BlockNote's conversion helpers.
- BlockNote upgrades can include schema migrations, which need testing against existing docs.
- Mantine upgrades must stay within the versions `@blocknote/mantine` supports (currently `^8.3.11 || ^9.0.2`).
- Mantine is the heaviest of the three options (extra JS, plus CSS on first load). Using it for the app UI as well, rather than only for the editor, is what makes that weight worthwhile. The PWA caches it after the first load.
- High-level theming covers colours, radius, depth and font. Anything finer means overriding Mantine's or BlockNote's CSS classes (`.bn-*`), which aren't a stable public API, so keep such overrides few and re-check them on upgrades.
- Existing hand-styled UI (sidebar, database table, trash, diagnostics) moves to Mantine components as it's next worked on. It doesn't all need to be rewritten at once.
