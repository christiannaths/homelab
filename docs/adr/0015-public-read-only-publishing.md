# 15. Public, read-only publishing of pages and subpages

- Status: Accepted
- Date: 2026-10-16

## Context
Editing access is per workspace (ADR 13), but some pages should be readable by a wider audience: people with no account, outside the private network.

## Decision
- A workspace member can **publish a page**. Publishing a page also publishes its **subpages**, and readers can navigate between them.
- Published pages are **read-only and live**: they always show the latest saved content. There's no separate "update published version" step.
- Readers need **no account** and **don't sync**. The server renders published pages to HTML from the stored documents, using BlockNote's server-side package (`@blocknote/server-util`, MPL-2.0, allowed under ADR 10).
- Published pages are served on a **separate listener (port)** that serves only published content. The app, its API and sync are never reachable through it. An instance can expose that port publicly (e.g. Tailscale Funnel or a reverse proxy) while everything else stays private.
- Each published page has a stable, unguessable URL. Unpublishing takes effect immediately.

## Consequences
- The server now reads page contents, as ADR 7 allows for features built alongside its storage. The storage format doesn't change.
- **Publishing applies to the subtree as it is now and as it changes:** a subpage created or moved under a published page becomes public, and one moved out stops being public. The UI must make clear which pages are public, including those public because of a published ancestor.
- The public listener is internet-facing, so it needs its own hardening: read-only routes, no session cookies, caching and rate limiting.
