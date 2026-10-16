# AGENTS.md

Tool versions are pinned in `mise.toml` (Node 26). Run `mise install` once, then run commands through mise (`mise exec -- npm test`) if the shell's Node is older.

## Agent skills

Matt Pocock's skills (`mattpocock/skills`) are installed in `.agents/skills/` (read by Codex) and symlinked into `.claude/skills/` (read by Claude Code). Update with `npx skills@latest update`; versions are pinned in `skills-lock.json`.

### Issue tracker

Issues are tracked in this repo's GitHub Issues (`christiannaths/localnotion`) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
