# ADR-PLAT-002. How do several independent apps share one repo?

- Status: Accepted
- Date: 2026-10-26
- Depends on: [ADR-PLAT-001](ADR-PLAT-001-toolchain.md)
- Dependency of: [ADR-PLAT-003](ADR-PLAT-003-proof-of-concept-code.md), [ADR-PLAT-004](ADR-PLAT-004-sign-in.md), [ADR-PLAT-005](ADR-PLAT-005-app-settings.md), [ADR-PLAT-006](ADR-PLAT-006-code-quality.md), [ADR-PLAT-008](ADR-PLAT-008-work-previews.md), [ADR-PLAT-009](ADR-PLAT-009-app-contract.md)

## Context

The repo is a home for several homelab apps and the platform that runs them. What the apps share is their approach and their deployment, not their features: each app is built, tested and shipped on its own, and an app must never break because another one changed. Around the apps sits the platform, which signs people in, lists their apps and adds the App switcher to every app. When the accounts service and Home sat in `apps/` next to Notes, and the gateway and the App switcher sat in `packages/` next to the theme, the folders did not say which code an app may rely on, and apps came to reach into platform details. A tool is needed that runs tasks across the repo in the right order, rebuilds only what a change touches, and keeps apps from depending on each other or on the platform.

## Decision

- **Nx** runs tasks across the repo, on top of npm workspaces ([ADR-PLAT-001](ADR-PLAT-001-toolchain.md)).
- **Three kinds of code:**
  - An **app**, such as Notes or the Encyclopedia, works through the app contract alone ([ADR-PLAT-009](ADR-PLAT-009-app-contract.md)) and knows only about itself.
  - The **platform** is everything around apps: the gateway, the accounts service, Home, the App switcher and manifest reading. Code is the platform's when it needs platform knowledge, such as a person's App access across apps. Whether an install can leave a piece out is a separate question: Home is the platform's, since it shows a person's App access across every app, though an install can leave it out.
  - **Packages** are libraries apps may use, such as `@homelab/theme`. Code moves there only when a second app needs it, except a package that a platform ADR requires every app to use, which starts there, for example `@homelab/settings` ([ADR-PLAT-005](ADR-PLAT-005-app-settings.md)).
- **Layout:**
  - `apps/<app>/` holds one app, split into npm workspace packages such as `web`, `server` and `e2e`. Each package is one Nx project, named `<app>-<package>` (for example `notes-web`).
  - `platform/` holds the platform: `accounts/`, `home/` (its `server` and `web`), `gateway/`, `app-switcher/`, `app-manifests/` and `e2e/`, the platform's end-to-end suite. Each is one Nx project named after its folder (`accounts`, `gateway`, `platform-e2e`), except Home's two, `home-server` and `home-web`.
  - `packages/` holds the libraries apps may use.
  - `tools/` holds repo scripts, as the `tools` project.
  - Each app keeps its own `Dockerfile` and `compose.yaml`. An image builds from the app's own packages, with plain npm commands and without Nx.
  - **Docs follow the same split.** `apps/<app>/docs/` holds that app's ADRs, specs and research. The root `docs/` holds what holds for every app and the platform, starting with the platform ADRs.
- **Tasks stay `package.json` scripts.** Nx reads them as targets, and `nx.json` adds only task order and caching. Nx plugins that infer or wrap tasks are not used.
- **Every project has two tags:** a scope (`scope:<app>` for an app's projects, `scope:platform` for `platform/`, `scope:shared` for `packages/` and `scope:tools` for `tools/`) and `platform:browser`, `platform:node` or `platform:any`.
- **Module boundaries** are checked by `npm run boundaries` (`tools/check-boundaries.ts`), which reads the Nx project graph:
  - An app depends only on its own scope and `scope:shared`, so it never depends on another app or on the platform.
  - A platform project depends on `scope:platform` and `scope:shared`. It may also list an app as an implicit dependency, never an import, where its end-to-end suite needs the app's build.
  - `scope:shared` depends only on `scope:shared`.
  - `tools` depends on `scope:tools`, `scope:platform` and `scope:shared`, since its dev stack and previews start the platform.
  - Imports cross platforms only into `platform:any`.
- **Scripts are TypeScript too.** Node 26 runs `.ts` files directly by stripping their types, so a script needs no build step. Each script is typechecked by its project, with `erasableSyntaxOnly` so that it uses only syntax Node can strip.
- **No Nx Cloud.** `nx.json` sets `neverConnectToCloud` and turns analytics off, and the cache is local only. The `nx` package's install script is not approved in `allowScripts`, because it only updates the Nx Cloud client.

## Alternatives considered

- **Turborepo**, on the maintainer's experience that it adds little.
- **`@nx/enforce-module-boundaries`** for the boundary check. It needs typescript-eslint, which supports TypeScript up to 6.0, and the repo uses TypeScript 7.
- **Platform services as apps in `apps/`**, as the accounts service and Home were. The folder names then did not say which code an app may import, and the boundary rule could not tell an app reaching into the platform from one using a library.
- **Leaving-out-able as the test for platform code**, so that Home, which an install can leave out, would be an app. Home still shows every app from its manifest and a person's App access across apps, which no app may rely on.

## Evidence

- This repo on Nx 23.3.0 and Node 26.12.0: through `nx run-many`, typecheck, the unit tests and the build pass, and a repeat run is served entirely from the cache. The e2e tests pass as `nx run notes-e2e:e2e` and `nx run platform-e2e:e2e`.
- The first Notes spike's image builds from `spikes/notes-block-editing-collaboration-poc/Dockerfile`, starts, and answers `/api/health`.
- The boundary script was tested against a planted shared package that imported from an app and was imported by the server across platforms, and it reported both violations.
- The boundary rule's cases are unit tests of `checkBoundaries` (`tools/check-boundaries.test.ts`): an app depending on the platform or another app, the platform importing an app or building one implicitly, a shared package depending on either, and imports across platforms.
- An app importing a platform project fails the check. With `@homelab/app-manifests` added to `notes-server`'s dependencies and imported from its `src/server.ts`, the check exits 1 (checked 2026-10-26, PR for issue #121):

  ```text
  $ npm run boundaries
  Module boundary violations:
    - notes-server → app-manifests: scope:notes may depend only on scope:notes or scope:shared
  ```

- Nx analyses imports in source files only when `pluginsConfig["@nx/js"]` is set, because `@nx/js` is not installed. Without that setting, the graph holds only `package.json` and implicit dependencies, and the boundary check passes everything.
- With a root `tsconfig.base.json` or `tsconfig.json`, Nx 23.3.0 reads it through `readConfigFile` from the TypeScript API, which TypeScript 7 lacks, as soon as it resolves an import of a workspace package (checked 2026-10-20). It then writes a partial graph and still exits 0, so the script treats that output as a failure. A root `tsconfig.shared.json` is a name Nx does not look for.

## Consequences

- Repo-wide commands are `nx run-many -t <target>` (wrapped as `npm run build`, `typecheck`, `test` and `test:e2e`), and one project's are `nx <target> <project>`. CI can use `nx affected` to build and test only what a change touched.
- A runtime dependency that is not an import, such as the server serving the web build, is declared with `implicitDependencies` so that tasks run in the right order. The platform's end-to-end suite gets Notes' and the Encyclopedia's builds this way.
- An app's code that needs platform knowledge belongs in the platform, or reaches the app through the app contract; a library both need goes in `packages/`.
- Every project's `tsconfig.json` extends the root `tsconfig.shared.json` for the compiler options they share. The root has no `tsconfig.base.json` or `tsconfig.json`, because Nx would then read it through the TypeScript API, which TypeScript 7 does not provide. Shared packages are found through npm workspace links instead of TypeScript `paths`.
- Moving to `@nx/enforce-module-boundaries` is possible once typescript-eslint supports TypeScript 7, and would add per-file errors in editors.
- Packages use the `@homelab/` scope, after the repo's name.

## Changelog

- 2026-10-26: The repo splits into apps, the platform and packages. The accounts service, Home, the gateway, the App switcher, manifest reading and the cross-app end-to-end suite move to `platform/`, with `scope:platform`, and `packages/` keeps only libraries apps may use. An app may no longer depend on the platform, which may build apps only through implicit dependencies. The folders had not said which code an app may rely on, and apps reached into platform details (spec #119, issue #121).
- 2026-10-20: Projects share their compiler options through a root `tsconfig.shared.json`, a name Nx does not read, instead of each repeating them.
- 2026-10-18: A package that a platform ADR requires every app to use starts in `packages/` before a second app exists, so that every app gets the same behaviour from the first ([ADR-PLAT-005](ADR-PLAT-005-app-settings.md), issue #40).
- 2026-10-16: Accepted. Nx on npm workspaces, with apps in `apps/`, code shared by more than one app in `packages/` once a second app needs it, and module boundaries checked from the Nx project graph.
