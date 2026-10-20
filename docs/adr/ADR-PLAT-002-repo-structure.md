# ADR-PLAT-002. How do several independent apps share one repo?

- Status: Accepted
- Date: 2026-10-20
- Depends on: [ADR-PLAT-001](ADR-PLAT-001-toolchain.md)
- Dependency of: [ADR-PLAT-003](ADR-PLAT-003-proof-of-concept-code.md), [ADR-PLAT-004](ADR-PLAT-004-sign-in.md), [ADR-PLAT-005](ADR-PLAT-005-app-settings.md), [ADR-PLAT-006](ADR-PLAT-006-code-quality.md)

## Context

The repo is growing from one app into a home for several homelab apps. What the apps share is their approach and their deployment, not their features: each app is built, tested and shipped on its own, and an app must never break because another one changed. A tool is needed that runs tasks across the apps in the right order, rebuilds only what a change touches, and keeps the apps from depending on each other.

## Decision

- **Nx** runs tasks across the repo, on top of npm workspaces ([ADR-PLAT-001](ADR-PLAT-001-toolchain.md)).
- **Layout:**
  - `apps/<app>/` holds one app, split into npm workspace packages such as `web`, `server` and `e2e`. Each package is one Nx project, named `<app>-<package>` (for example `notes-web`).
  - `packages/` holds code shared by more than one app. Code moves there only when a second app needs it, except a package that a platform ADR requires every app to use, which starts there, for example `@homelab/settings` ([ADR-PLAT-005](ADR-PLAT-005-app-settings.md)).
  - `tools/` holds repo scripts, as the `tools` project.
  - Each app keeps its own `Dockerfile` and `compose.yaml`. An image builds from the app's own packages, with plain npm commands and without Nx.
  - **Docs follow the same split.** `apps/<app>/docs/` holds that app's ADRs, specs and research. The root `docs/` holds only what holds for every app, starting with the platform ADRs.
- **Tasks stay `package.json` scripts.** Nx reads them as targets, and `nx.json` adds only task order and caching. Nx plugins that infer or wrap tasks are not used.
- **Every project has two tags:** `scope:<app>` (`scope:shared` for `packages/`, `scope:tools` for `tools/`) and `platform:browser`, `platform:node` or `platform:any`.
- **Module boundaries** are checked by `npm run boundaries` (`tools/check-boundaries.ts`), which reads the Nx project graph:
  - A project depends only on its own scope or on `scope:shared`, so apps never depend on each other.
  - Imports cross platforms only into `platform:any`.
- **Scripts are TypeScript too.** Node 26 runs `.ts` files directly by stripping their types, so a script needs no build step. Each script is typechecked by its project, with `erasableSyntaxOnly` so that it uses only syntax Node can strip.
- **No Nx Cloud.** `nx.json` sets `neverConnectToCloud` and turns analytics off, and the cache is local only. The `nx` package's install script is not approved in `allowScripts`, because it only updates the Nx Cloud client.

## Alternatives considered

- **Turborepo**, on the maintainer's experience that it adds little.
- **`@nx/enforce-module-boundaries`** for the boundary check. It needs typescript-eslint, which supports TypeScript up to 6.0, and the repo uses TypeScript 7.

## Evidence

- This repo on Nx 23.3.0 and Node 26.12.0: through `nx run-many`, typecheck, the unit tests and the build pass, and a repeat run is served entirely from the cache. The e2e tests pass as `nx run notes-e2e:e2e`.
- The Notes image builds from `apps/notes/Dockerfile`, starts, and answers `/api/health`.
- The boundary script was tested against a planted shared package that imported from an app and was imported by the server across platforms, and it reported both violations.
- Nx analyses imports in source files only when `pluginsConfig["@nx/js"]` is set, because `@nx/js` is not installed. Without that setting, the graph holds only `package.json` and implicit dependencies, and the boundary check passes everything.
- With a root `tsconfig.base.json` and an import Nx cannot resolve, Nx 23.3.0 calls `readConfigFile` from the TypeScript API, which TypeScript 7 lacks. It then writes a partial graph and still exits 0, so the script treats that output as a failure. Imports that resolve build the full graph with that file present (checked 2026-10-20), so the boundary check fails only while an import is broken, which typecheck reports too.

## Consequences

- Repo-wide commands are `nx run-many -t <target>` (wrapped as `npm run build`, `typecheck`, `test` and `test:e2e`), and one project's are `nx <target> <project>`. CI can use `nx affected` to build and test only what a change touched.
- A runtime dependency that is not an import, such as the server serving the web build, is declared with `implicitDependencies` so that tasks run in the right order.
- Shared packages are found through npm workspace links, not TypeScript `paths`.
- Moving to `@nx/enforce-module-boundaries` is possible once typescript-eslint supports TypeScript 7, and would add per-file errors in editors.
- Packages use the `@homelab/` scope, after the repo's name.

## Changelog

- 2026-10-20: Dropped the ban on a root `tsconfig.base.json`. It only makes the boundary check fail while an import is broken, so every project now extends one shared base.
- 2026-10-18: A package that a platform ADR requires every app to use starts in `packages/` before a second app exists, so that every app gets the same behaviour from the first ([ADR-PLAT-005](ADR-PLAT-005-app-settings.md), issue #40).
- 2026-10-16: Accepted. Nx on npm workspaces, with apps in `apps/`, code shared by more than one app in `packages/` once a second app needs it, and module boundaries checked from the Nx project graph.
