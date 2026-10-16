# 10. BlockNote is the page editor, using only its MPL-licensed packages

- Status: Accepted
- Date: 2026-10-16

## Context
A Notion-style block editor with live collaboration on Yjs is the largest single UI component. Building one from scratch isn't worthwhile.

## Decision
- Page bodies are edited with **BlockNote** (`@blocknote/core`, `@blocknote/react`, `@blocknote/mantine`; MPL-2.0). It's bound to the page doc's `content` fragment through `@blocknote/core/yjs`.
- **We don't use BlockNote's "XL" packages** (GPL-3.0 or commercial; e.g. PDF/DOCX export or AI). Features like those need another implementation.
- The client UI uses **React**, which BlockNote requires.

## Evidence
- PR #1: live co-editing, cursors and presence, offline edits merging inside a paragraph, and server persistence.
- PR #2: row pages reuse the same editor.

## Consequences
- The page-body format is BlockNote's ProseMirror schema stored in Yjs. Markdown import and export must go through BlockNote's conversion helpers.
- BlockNote upgrades can include schema migrations, which need testing against existing docs.
