# ADR-PLAT-006. How is code kept consistently formatted and free of common mistakes?

- Status: Accepted
- Date: 2026-10-17
- Depends on: [ADR-PLAT-001](ADR-PLAT-001-toolchain.md), [ADR-PLAT-002](ADR-PLAT-002-repo-structure.md), [ADR-PLAT-003](ADR-PLAT-003-proof-of-concept-code.md)
- Dependency of: none

## Context

The repo (TS/TSX, Markdown and ADRs, CSS, JSON, YAML, HTML, shell, Dockerfiles) grows by many small changes from people and agents; without shared formatting, diffs fill with style changes, and mistakes no compiler sees (a floating promise, a CSS property browsers silently drop) reach review. typescript-eslint doesn't support TypeScript 7 ([ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)), so the usual ESLint setup is out.

## Decision

| Tool | Covers | Setup |
| --- | --- | --- |
| Prettier | Formats TS, JS, JSON, YAML, CSS, HTML, Markdown | Defaults plus diff-shrinking options: `proseWrap: "never"` (a paragraph is one line; tables too wide to align stay compact), `singleAttributePerLine`, `quoteProps: "consistent"` |
| Oxlint | Lints TS and TSX | `correctness` and `suspicious`; React (incl. Hooks), jsx-a11y, import and TypeScript plugins; type-aware rules from `oxlint-tsgolint` (floating and misused promises, unsafe `any`, unchecked `as` casts); all errors. Rules that don't fit are off in `.oxlintrc.json`, each with a stated reason |
| markdownlint-cli2 | Lints Markdown | Rules Prettier owns are off |
| Stylelint | Lints CSS | `stylelint-config-standard` |
| ls-lint | Checks names | Folders and files kebab-case; `.tsx` may be PascalCase (React components); Markdown may use conventional upper-case names (`README.md`); ADR files follow their own pattern, checked in full by `npm run adrs` |

- **Not linted by the repo:** shell scripts and Dockerfiles (checked in the editor); YAML, JSON and HTML beyond Prettier's formatting. TOML is neither formatted nor linted.
- **Scope:** whole repo, spikes included ([ADR-PLAT-003](ADR-PLAT-003-proof-of-concept-code.md)). Excluded: vendored skills `npx skills` manages in `.agents/skills/` (this repo's own `adr` and `comments` skills are included).
- **Config at the repo root**, one file per tool; each tool runs once over the whole repo, not as a per-project Nx target ([ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)).
- **Where the checks run:**

  | Command | Does |
  | --- | --- |
  | `npm run check` | `npm run format:check` and `npm run lint`, before boundary, ADR, typecheck and test checks |
  | `npm run fix` | Every tool's safe fixes, then Prettier |
  | Pre-commit hook (husky, lint-staged) | Fixes and re-stages staged files, runs ls-lint, runs `npm run adrs` when an ADR changes; no typecheck or tests |

- **Every tool is a root dev dependency** installed by `npm install` ([ADR-PLAT-001](ADR-PLAT-001-toolchain.md)); husky sets up the hook via the root `prepare` script.

## Alternatives considered

- **Biome**: far fewer lint rules than Oxlint, no type-aware rules; Prettier preferred for formatting.
- **ESLint** (incl. `@eslint/css`): typescript-eslint doesn't support TypeScript 7, and ESLint for CSS alone adds a second linter for one language.
- **ShellCheck and hadolint**: no maintained npm package, so each needs mise, Docker or a binary-downloading install script. Editor linting judged enough.
- **yamllint**: Python; Prettier already rejects invalid YAML.
- **An Nx `lint` target per project**: docs and root config belong to no project, and the whole repo lints in seconds, so caching saves little.
- **Pinning non-npm tools in `mise.toml`**: would make mise required, where `nvm` is enough today.

## Evidence

- This repo (Node 26.12.0, ~140 TS and ~45 Markdown files): `npm run lint` ~3 s, `npm run format:check` ~3.5 s.
- `oxlint-tsgolint` 7.0 is built on TypeScript 7's Go compiler; its type-aware rules run against the repo's `tsconfig.json` files.
- PR #44 one-time cleanup: formatted the repo, applied safe fixes, renamed six spike files to kebab-case; typecheck and unit tests passed for every project, spikes included.
- `proseWrap: "never"` chosen after aligned tables broke `tools/check-adrs.ts` (matches index rows exactly) and made every row change when one cell grew.

## Consequences

- Every commit is formatted and linted, so review sees only meaningful changes.
- No rule relaxed for spikes: PR #44 fixed their findings by hand (changing frozen code) and reran their tests to show behaviour held.
- A value the compiler can't type (JSON body, database row, Yjs map entry) needs a runtime check before use, since unchecked `as` casts are banned.
- Files in a package without its own `tsconfig.json` get weaker type-aware results (Oxlint can't resolve their types).
- CI isn't part of this decision. Until it runs `npm run check`, `git commit --no-verify` skips the hook.
