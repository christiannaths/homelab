# AGENTS.md

## Agent skills

Matt Pocock's skills (`mattpocock/skills`) are installed in `.agents/skills/` (read by Codex) and symlinked into `.claude/skills/` (read by Claude Code). Update with `npx skills@latest update`; versions are pinned in `skills-lock.json`.

### Issue tracker

Issues are tracked in this repo's GitHub Issues (`christiannaths/homelab`) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Branch names

Branches are named `<type>/<slug>` (e.g. `feat/offline-sync`), with `<type>` one of `feat`, `fix`, `docs`, `chore`, `spike`. Use the `branch` skill (`.agents/skills/branch/`) whenever you create one; a Claude Code hook rejects other names.

### Domain docs

Platform ADRs are in `docs/adr/`, and each app keeps its own in `apps/<app>/docs/adr/` (for example `apps/notes/docs/adr/`). See `docs/agents/domain.md`.

### ADRs

To record or edit an ADR, use this repo's own `adr` skill (`.agents/skills/adr/`, not part of `mattpocock/skills`): it replaces `domain-modeling`'s `ADR-FORMAT.md`. Each topic keeps one ADR, edited in place with a Changelog entry when its decision changes. ADR edits ship in the PR whose code they describe, never in a separate docs PR before or after.

### Comments

Before writing or reviewing a code comment, use this repo's own `comments` skill (`.agents/skills/comments/`, not part of `mattpocock/skills`): a comment records why, and the code says what.
