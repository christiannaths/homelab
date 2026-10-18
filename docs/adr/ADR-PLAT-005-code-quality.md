# ADR-PLAT-005. How is code kept consistently formatted and free of common mistakes?

- Status: Accepted
- Date: 2026-10-17
- Depends on: [ADR-PLAT-001](ADR-PLAT-001-toolchain.md), [ADR-PLAT-002](ADR-PLAT-002-repo-structure.md), [ADR-PLAT-003](ADR-PLAT-003-proof-of-concept-code.md)
- Dependency of: none

## Context

The repo holds TypeScript and TSX, Markdown docs and ADRs, CSS, JSON, YAML, HTML, shell scripts and Dockerfiles, and it grows by many small changes from people and agents. Without shared formatting, diffs fill with style changes, and mistakes that no compiler sees, such as a floating promise or a CSS property a browser silently drops, reach review. ESLint's TypeScript support (typescript-eslint) does not support TypeScript 7 ([ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)), so the usual ESLint setup is not available.

## Decision

- **Prettier** formats every file it supports: TypeScript, JavaScript, JSON, YAML, CSS, HTML and Markdown. It keeps its defaults, plus options that keep diffs small: `proseWrap: "never"` (a paragraph is one line, and tables too wide to align stay compact), `singleAttributePerLine` and `quoteProps: "consistent"`.
- **Oxlint** lints TypeScript and TSX with its `correctness` and `suspicious` categories, its React (including Hooks), jsx-a11y, import and TypeScript plugins, and type-aware rules from `oxlint-tsgolint` (floating and misused promises, unsafe `any`, and unchecked `as` casts), all as errors. Rules that do not fit the repo are switched off in `.oxlintrc.json`, each for a stated reason.
- **markdownlint-cli2** lints Markdown, with the rules Prettier owns switched off.
- **Stylelint** lints CSS with `stylelint-config-standard`.
- **ls-lint** checks names: folders and files are kebab-case, `.tsx` files may be PascalCase for React components, Markdown files may use conventional upper-case names such as `README.md`, and ADR files follow their own pattern, which `npm run adrs` checks in full.
- **Not linted by the repo:** shell scripts and Dockerfiles, which are checked in the editor, and YAML, JSON and HTML beyond Prettier's formatting. TOML is neither formatted nor linted.
- **Scope:** the whole repo, spikes included ([ADR-PLAT-003](ADR-PLAT-003-proof-of-concept-code.md)). Vendored code is excluded: the skills that `npx skills` manages in `.agents/skills/` (the `adr` and `comments` skills are this repo's own and are included).
- **Configuration lives at the repo root**, one file per tool, and each tool runs once over the whole repo rather than as an Nx target in each project ([ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)).
- **Where the checks run:**
  - `npm run check` runs `npm run format:check` and `npm run lint` before the boundary, ADR, typecheck and test checks.
  - `npm run fix` applies every tool's safe fixes, then Prettier.
  - A pre-commit hook (husky and lint-staged) fixes and re-stages the staged files, runs ls-lint, and runs `npm run adrs` when an ADR changes. Typecheck and tests stay out of the hook.
- **Every tool is a root dev dependency** installed by `npm install` ([ADR-PLAT-001](ADR-PLAT-001-toolchain.md)). husky sets up the hook through the root `prepare` script.

## Alternatives considered

- **Biome** for formatting and linting. Its linter has far fewer rules than Oxlint and no type-aware rules, and Prettier was preferred for formatting.
- **ESLint**, including `@eslint/css` for CSS. typescript-eslint does not support TypeScript 7, and adding ESLint for CSS alone would add a second linter for one language.
- **ShellCheck and hadolint.** Neither has a maintained npm package, so each would need mise, Docker or an install script that downloads a binary. Linting shell scripts and Dockerfiles in the editor was judged enough.
- **yamllint**, which is Python. Prettier already rejects invalid YAML.
- **An Nx `lint` target in every project.** Docs and root config belong to no project, and the whole repo lints in seconds, so caching would save little.
- **Pinning non-npm tools in `mise.toml`.** It would make mise a requirement, where `nvm` is enough today.

## Evidence

- On this repo (Node 26.12.0, about 140 TypeScript files and 45 Markdown files), `npm run lint` takes about 3 s and `npm run format:check` about 3.5 s.
- `oxlint-tsgolint` 7.0 is built on TypeScript 7's Go compiler, and its type-aware rules run against the repo's `tsconfig.json` files.
- The one-time cleanup in PR #44 formatted the repo, applied safe fixes and renamed six spike files to kebab-case. Typecheck and unit tests passed for every project afterwards, spikes included.
- `proseWrap: "never"` was chosen after aligned tables broke `tools/check-adrs.ts`, which matches index rows exactly, and made every row change when one cell grew.

## Consequences

- Every commit is formatted and linted, so review sees only meaningful changes.
- No rule is relaxed for spikes. Their lint findings were fixed by hand in PR #44, which changed frozen code, and their tests were rerun to show the behaviour held.
- A value whose type the compiler cannot prove, such as a JSON body, a database row or a Yjs map entry, needs a runtime check before it is used, because unchecked `as` casts are banned.
- Files in a package without its own `tsconfig.json` get weaker type-aware results, because Oxlint cannot resolve their types.
- CI is not part of this decision. Until it runs `npm run check`, `git commit --no-verify` skips the hook.
