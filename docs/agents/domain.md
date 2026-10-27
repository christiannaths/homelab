# Domain Docs

How the engineering skills use this repo's domain docs when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root, or
- **`GLOSSARY-MAP.md`** at the repo root if it exists: it points at one `GLOSSARY.md` per context. Read each one relevant to the topic.
- **`docs/adr/`**: ADRs touching the area you're about to work in. App-scoped ADRs live in `apps/<app>/docs/adr/` (e.g. `apps/notes/docs/adr/`); check those too.

If any don't exist, **proceed silently**: don't flag their absence or suggest creating them upfront. The `/domain-modeling` skill (via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions get resolved.

## File structure

Single-context repo (most repos):

```text
/
├── GLOSSARY.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

Multi-context repo (presence of `GLOSSARY-MAP.md` at the root):

```text
/
├── GLOSSARY-MAP.md
├── docs/adr/                          ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── GLOSSARY.md
    │   └── docs/adr/                  ← context-specific decisions
    └── billing/
        ├── GLOSSARY.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When output names a domain concept (issue title, refactor proposal, hypothesis, test name), use the `GLOSSARY.md` term, not a synonym it avoids.

A concept missing from the glossary is a signal: either invented language (reconsider) or a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If output contradicts an existing ADR, say so explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
