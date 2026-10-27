# ADR-PLAT-006. How is code kept consistently formatted and free of common mistakes?

- Status: Accepted
- Date: 2026-10-17
- Depends on: [ADR-PLAT-001](ADR-PLAT-001-toolchain.md), [ADR-PLAT-002](ADR-PLAT-002-repo-structure.md), [ADR-PLAT-003](ADR-PLAT-003-proof-of-concept-code.md)
- Dependency of: none

## Context

Many small changes from people and agents; without shared formatting diffs fill with noise, and compiler-invisible mistakes (floating promises, dropped CSS) reach review. typescript-eslint doesn't support TypeScript 7 ([ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)).

## Decision

| Tool | Covers | Setup |
| --- | --- | --- |
| Prettier | TS, JS, JSON, YAML, CSS, HTML, Markdown | Defaults + `proseWrap: "never"`, `singleAttributePerLine`, `quoteProps: "consistent"` |
| Oxlint | TS, TSX | `correctness`, `suspicious`; React (incl. Hooks), jsx-a11y, import, TypeScript plugins; `oxlint-tsgolint` type-aware rules (promises, unsafe `any`, unchecked `as`); all errors; each disabled rule has a reason in `.oxlintrc.json` |
| markdownlint-cli2 | Markdown | Prettier-owned rules off |
| Stylelint | CSS | `stylelint-config-standard` |
| ls-lint | Names | kebab-case; PascalCase `.tsx` allowed; upper-case Markdown like `README.md`; ADR names checked by `npm run adrs` |

- **Not linted:** shell and Dockerfiles (editor only); YAML, JSON, HTML beyond formatting; TOML at all.
- **Scope:** whole repo incl. spikes ([ADR-PLAT-003](ADR-PLAT-003-proof-of-concept-code.md)), except `npx skills`-managed `.agents/skills/` (own `adr` and `comments` included).
- **Root config**, one file per tool, one run over the repo (no per-project Nx target).
- **Where:**

  | Command | Does |
  | --- | --- |
  | `npm run check` | `format:check`, `lint`, then boundaries, ADRs, typecheck, tests |
  | `npm run fix` | Safe fixes, then Prettier |
  | Pre-commit (husky, lint-staged) | Fix and re-stage staged files, ls-lint, `npm run adrs` on ADR changes; no typecheck or tests |

- All tools are root dev dependencies ([ADR-PLAT-001](ADR-PLAT-001-toolchain.md)); husky installs via `prepare`.

## Alternatives considered

- **Biome**: far fewer rules, none type-aware.
- **ESLint**: typescript-eslint lacks TypeScript 7; ESLint for CSS alone is a second linter.
- **ShellCheck, hadolint**: no maintained npm package.
- **yamllint**: Python; Prettier already rejects bad YAML.
- **Per-project Nx `lint`**: docs and root config have no project; full lint takes seconds.
- **mise-pinned tools**: would make mise required.

## Evidence

- ~140 TS + ~45 Markdown files: `lint` ~3 s, `format:check` ~3.5 s (Node 26.12.0).
- PR #44 cleanup: typecheck and tests passed everywhere after, spikes included.
- `proseWrap: "never"`: aligned tables broke `tools/check-adrs.ts` row matching and churned every row.

## Consequences

- Values the compiler can't type (JSON bodies, DB rows, Yjs entries) need a runtime check, since unchecked `as` is banned.
- Packages without their own `tsconfig.json` get weaker type-aware results.
- No CI yet: `git commit --no-verify` skips the hook.
