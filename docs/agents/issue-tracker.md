# Issue tracker: GitHub

Issues and specs are GitHub issues; use `gh`, which infers the repo inside a clone.

**Cloud sessions:** `gh auth status` reports an invalid token, but `gh api` works through the proxy; use it where the GitHub tools fall short (e.g. **Blocking** below).

## Conventions

| Operation | Command |
| --- | --- |
| **Create an issue** | `gh issue create --title "..." --body "..."` (heredoc for multi-line) |
| **Read an issue** | `gh issue view <number> --json number,title,body,labels,comments` |
| **List issues** | `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] \| {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` plus `--label` / `--state` |
| **Make an issue a sub-issue of a parent** | `gh issue create --parent <parent> ...` or `gh issue edit <parent> --add-sub-issue <child>` (`gh` 2.94+). Older: `gh api --method POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>` (database id, see **Blocking**). No sub-issues: `Part of #<parent>` atop the child body |
| **Comment on an issue** | `gh issue comment <number> --body "..."` |
| **Apply / remove labels** | `gh issue edit <number> --add-label "..."` / `--remove-label "..."` |
| **Close** | `gh issue close <number> --comment "..."` |

## How work is closed: one PR per spec

- Spec + all tickets = **one PR against `main`** from one branch (`feat/<spec#>-<slug>`, or the session's `claude/*` branch).
- Open as a **draft** after the first ticket's commit. Body: ticket checklist, then `Closes #<spec>` and `Closes #<ticket>` for each.
- Ticket commits are prefixed with the ticket number (`feat(#87): …`).
- No PR per ticket, no PR into a feature branch: previews deploy every PR regardless of base, and `Closes` only fires on merge into `main`.
- Each push updates the PR's preview.
- Ready when every ticket is ticked and `/code-review` has covered the branch.
- Non-spec work (bug, lone ticket): one PR per issue.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

If `yes`, PRs use the same labels and states via `gh pr`:

| Operation | Command |
| --- | --- |
| **Read a PR** | `gh pr view <number> --comments`; `gh pr diff <number>` |
| **List external PRs for triage** | `gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] \| select(.author_association \| IN("OWNER","MEMBER","COLLABORATOR") \| not) \| {number, title, author: .user.login, author_association, labels: [.labels[].name]}'` |
| **Comment / label / close** | `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close` |

Issues and PRs share numbers: resolve `#42` with `gh pr view 42`, then `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

See **Read an issue**.

## Wayfinding operations

For `/wayfinder`: one **map** issue, **child** issues as tickets.

- **Map**: labelled `wayfinder:map`, body Notes / Decisions-so-far / Fog. `gh issue create --label wayfinder:map`.
- **Child ticket**: sub-issue of the map (see **Make an issue a sub-issue of a parent**); else a task-list entry in the map plus `Part of #<map>` atop the child. Label `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Assigned to the driving dev once claimed.
- **Blocking**: GitHub's **native issue dependencies** (canonical, visible in the UI). `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ `#number` or `node_id`). `issue_dependencies_summary.blocked_by` counts open blockers (the live gate). Fallback: `Blocked by: #<n>, #<n>` atop the child body. Unblocked when all blockers close.
- **Frontier query**: map's open children (`gh issue list --state open`, scoped to its sub-issues / task list), minus those with an open blocker (`issue_dependencies_summary.blocked_by > 0` or an open `Blocked by` issue) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
