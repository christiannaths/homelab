# AGENTS.md

## Agent skills

`mattpocock/skills` live in `.agents/skills/` (Codex), symlinked into `.claude/skills/` (Claude Code). Update: `npx skills@latest update`; pinned in `skills-lock.json`.

### Issue tracker

GitHub Issues on `christiannaths/homelab`, via `gh`. See `docs/agents/issue-tracker.md`.

### Feature builds

A `/to-spec` spec and its `/to-tickets` tickets ship as **one PR**. Prefer `/implement-spec`; with `/implement`, commit on the spec's branch. One thread per spec where possible (each cloud thread gets its own branch). See "How work is closed" in `docs/agents/issue-tracker.md`.

### Triage labels

`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Branch names

`<type>/<slug>` (e.g. `feat/offline-sync`); type is `feat`, `fix`, `docs`, `chore` or `spike`. Create with the `branch` skill (`.agents/skills/branch/`); a hook rejects other names.

### Domain docs

Platform ADRs: `docs/adr/`; app ADRs: `apps/<app>/docs/adr/`. See `docs/agents/domain.md`.

### ADRs

Use this repo's own `adr` skill (`.agents/skills/adr/`, not part of `mattpocock/skills`; replaces `domain-modeling`'s `ADR-FORMAT.md`). One ADR per topic, edited in place with a Changelog entry when the decision changes. ADR edits ship in the PR whose code they describe, never a separate docs PR.

### Comments

Before writing or reviewing a code comment, use this repo's own `comments` skill (`.agents/skills/comments/`, not part of `mattpocock/skills`): comments say why; code says what.
