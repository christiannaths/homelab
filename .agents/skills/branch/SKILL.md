---
name: branch
description: Name and create a git branch. Use when starting work that needs a new branch, or when a branch name is rejected.
---

# Branch

A branch name is `<type>/<slug>`, for example `feat/offline-sync` or `fix/42-login-redirect`. A `PreToolUse` hook (`.claude/hooks/check-branch-name.ts`) rejects any other name, so this skill and that hook hold the same rule.

## Convention

- **type** is the kind of change, using the Conventional Commits words:

  | Type       | For                                                  |
  | ---------- | ---------------------------------------------------- |
  | `feat`     | New behaviour a user can see                         |
  | `fix`      | A bug fix                                            |
  | `refactor` | Restructuring with no behaviour change               |
  | `test`     | Tests only                                           |
  | `docs`     | Documentation, ADRs, agent docs                      |
  | `chore`    | Tooling, dependencies, config, CI, repo housekeeping |
  | `spike`    | Throwaway exploration (lives in `spikes/`)           |
  | `design`   | Design work: specs, data models, access control      |

- **slug** is 2 to 5 lowercase kebab-case words naming the change, not the task (`offline-sync`, not `work-on-ticket`). When the work comes from a GitHub issue, lead with its number: `feat/42-offline-sync`.
- **`claude/*`** names are assigned by Claude Code cloud sessions. When the session instructions name a branch, that branch is the one: use it as given.

## Steps

1. If the session already names a branch to work on, check it out (create it if missing) and stop here.
2. Pick the type and slug from the task, or from `$ARGUMENTS` when invoked as `/branch <description>`. When two types fit, take the one describing the main change.
3. Confirm the name is free: `git branch --list <name>` and `git ls-remote --heads origin <name>` both print nothing.
4. Create it from the latest `main` unless the user named another base: `git fetch origin main && git switch -c <name> origin/main`.

Done when `git branch --show-current` prints the new name.
