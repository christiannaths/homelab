# Notes model

The Notes rules as plain TypeScript, no React, DOM or network ([ADR-NOTE-008](../docs/adr/ADR-NOTE-008-model-correctness.md)), used by the [server](../server) and the [web client](../web). Yjs stays behind `src/ydoc.ts`; everything else works on plain `Page` data.

- **Access** (`access.ts`, [ADR-NOTE-012](../docs/adr/ADR-NOTE-012-page-permissions.md)): levels, inheritance down the derived tree, per-person overrides incl. No access, most permissive wins; nothing outside the page's workspace.
- **Page tree** (`tree.ts`, [ADR-NOTE-006](../docs/adr/ADR-NOTE-006-merge-safety.md)): one workspace's sidebar and Trash, derived around cycles and unreceived parents.
- **Edits** (`edits.ts`): a new page at the end of its list; trash; restore, with a page whose parent is still trashed returning to the end of the Private section.
- **Update review** (`review.ts`, [ADR-NOTE-010](../docs/adr/ADR-NOTE-010-sync-and-access-checks.md)): the level a document opens at, and the checks on each update; `previewUpdate` gives the change from a scratch copy.
- **Documents** (`documents.ts`, `ydoc.ts`, [ADR-NOTE-013](../docs/adr/ADR-NOTE-013-data-layout.md)): `page:<id>` (`meta`, `access`, `content`), `index:<personId>`, `workspace:<id>`.

`npx nx test notes-model` runs the unit and two-device convergence tests.
