# ADR-PLAT-002. How do several independent apps share one repo?

- Status: Accepted
- Date: 2026-10-26
- Depends on: [ADR-PLAT-001](ADR-PLAT-001-toolchain.md)
- Dependency of: [ADR-PLAT-003](ADR-PLAT-003-proof-of-concept-code.md), [ADR-PLAT-004](ADR-PLAT-004-sign-in.md), [ADR-PLAT-005](ADR-PLAT-005-app-settings.md), [ADR-PLAT-006](ADR-PLAT-006-code-quality.md), [ADR-PLAT-008](ADR-PLAT-008-work-previews.md), [ADR-PLAT-009](ADR-PLAT-009-app-contract.md)

## Context

Apps share approach and deployment, not features: each is built, tested and shipped alone, and must never break because another changed; the platform around them signs people in, lists apps and adds the App switcher. With the accounts service and Home in `apps/` and the gateway and switcher in `packages/`, folders didn't say what an app may rely on, and apps reached into platform details. A tool must run tasks in order, rebuild only what a change touches, and keep apps from depending on each other or the platform.

## Decision

- **Nx** runs tasks, on top of npm workspaces ([ADR-PLAT-001](ADR-PLAT-001-toolchain.md)).
- **Three kinds of code:**

  | Kind | Folder | What | Scope tag |
  | --- | --- | --- | --- |
  | App | `apps/<app>/` | e.g. Notes, Encyclopedia. Knows only itself; works through the app contract alone ([ADR-PLAT-009](ADR-PLAT-009-app-contract.md)) | `scope:<app>` |
  | Platform | `platform/` | Everything around apps: gateway, accounts service, Home, App switcher, manifest reading | `scope:platform` |
  | Package | `packages/` | Libraries apps may use, e.g. `@homelab/theme` | `scope:shared` |
  | Tools | `tools/` | Repo scripts, as the `tools` project | `scope:tools` |

- Code is the platform's when it needs platform knowledge, such as a person's App access across apps. Whether an install can leave it out is a separate question: Home is platform (shows App access across every app), though optional.
- Code moves to `packages/` only when a second app needs it, except a package a platform ADR requires every app to use, which starts there (e.g. `@homelab/settings`, [ADR-PLAT-005](ADR-PLAT-005-app-settings.md)).
- **Layout:**
  - An app is split into workspace packages (`web`, `server`, `e2e`…), each one Nx project `<app>-<package>` (e.g. `notes-web`).
  - `platform/` holds `accounts/`, `home/` (`server`, `web`), `gateway/`, `app-switcher/`, `app-manifests/` and `e2e/` (the platform's end-to-end suite). Each is one Nx project named after its folder (`accounts`, `gateway`, `platform-e2e`), except Home's `home-server` and `home-web`.
  - Each app keeps its own `Dockerfile` and `compose.yaml`; an image builds from the app's own packages with plain npm, no Nx.
  - **Docs follow the split:** `apps/<app>/docs/` holds an app's ADRs, specs and research; root `docs/` holds what holds for every app and the platform, starting with platform ADRs.
- **Tasks stay `package.json` scripts.** Nx reads them as targets; `nx.json` adds only order and caching. No Nx plugins that infer or wrap tasks.
- **Two tags per project:** a scope (table above) and `platform:browser`, `platform:node` or `platform:any`.
- **Module boundaries:** `npm run boundaries` (`tools/check-boundaries.ts`) checks the Nx project graph:

  | Project | May depend on |
  | --- | --- |
  | App | its own scope, `scope:shared` |
  | Platform | `scope:platform`, `scope:shared`; an app only as an implicit dependency (never an import), where its e2e suite needs the app's build |
  | `scope:shared` | `scope:shared` |
  | `tools` | `scope:tools`, `scope:platform`, `scope:shared` (its dev stack and previews start the platform) |

  Imports cross platforms only into `platform:any`.

- **Scripts are TypeScript.** Node 26 strips types and runs `.ts` directly, no build step. Each script is typechecked by its project with `erasableSyntaxOnly`, so it uses only strippable syntax.
- **No Nx Cloud.** `nx.json` sets `neverConnectToCloud`, analytics off, local cache only. The `nx` install script isn't approved in `allowScripts`; it only updates the Nx Cloud client.

## Alternatives considered

- **Turborepo**: maintainer's experience is it adds little.
- **`@nx/enforce-module-boundaries`**: needs typescript-eslint, which supports TypeScript up to 6.0; the repo uses 7.
- **Platform services as apps in `apps/`** (as accounts and Home were): folders didn't say what an app may import, and the boundary rule couldn't tell an app reaching into the platform from one using a library.
- **Leaving-out-able as the test for platform code** (making Home an app): Home still shows every app from its manifest and a person's App access across apps, which no app may rely on.

## Evidence

- Nx 23.3.0, Node 26.12.0: typecheck, unit tests and build pass through `nx run-many`; a repeat run is served entirely from cache. E2e passes as `nx run notes-e2e:e2e` and `nx run platform-e2e:e2e`.
- First Notes spike's image builds from `spikes/notes-block-editing-collaboration-poc/Dockerfile`, starts, answers `/api/health`.
- Boundary script vs a planted shared package importing from an app and imported by the server across platforms: both violations reported.
- `tools/check-boundaries.test.ts` unit-tests `checkBoundaries`: app → platform or another app, platform importing an app or building one implicitly, shared → either, cross-platform imports.
- App importing a platform project fails: with `@homelab/app-manifests` added to `notes-server`'s dependencies and imported from `src/server.ts`, the check exits 1 (2026-10-26, PR for issue #121):

  ```text
  $ npm run boundaries
  Module boundary violations:
    - notes-server → app-manifests: scope:notes may depend only on scope:notes or scope:shared
  ```

- Nx analyses source imports only when `pluginsConfig["@nx/js"]` is set (`@nx/js` isn't installed). Without it, the graph holds only `package.json` and implicit dependencies and the check passes everything.
- With a root `tsconfig.base.json` or `tsconfig.json`, Nx 23.3.0 reads it via the TypeScript API's `readConfigFile`, missing in TypeScript 7, once it resolves a workspace-package import (2026-10-20). It then writes a partial graph and exits 0, so the script treats that output as failure. Nx doesn't look for `tsconfig.shared.json`.

## Consequences

- Repo-wide: `nx run-many -t <target>` (wrapped as `npm run build`, `typecheck`, `test`, `test:e2e`); one project: `nx <target> <project>`. CI can use `nx affected`.
- A runtime dependency that isn't an import (e.g. server serving the web build) is declared in `implicitDependencies` so tasks run in order. The platform e2e suite gets Notes' and Encyclopedia's builds this way.
- App code needing platform knowledge belongs in the platform or reaches the app through the app contract; a library both need goes in `packages/`.
- Every project's `tsconfig.json` extends root `tsconfig.shared.json`. No root `tsconfig.base.json` or `tsconfig.json` (Nx would read it via the TypeScript API, see Evidence). Shared packages resolve via npm workspace links, not TypeScript `paths`.
- `@nx/enforce-module-boundaries` becomes possible once typescript-eslint supports TypeScript 7, adding per-file editor errors.
- Packages use the `@homelab/` scope, after the repo's name.

## Changelog

- 2026-10-26: Split into apps, platform and packages. Accounts, Home, gateway, App switcher, manifest reading and the cross-app e2e suite move to `platform/` (`scope:platform`); `packages/` keeps only libraries apps may use. Apps may no longer depend on the platform, which builds apps only via implicit dependencies. Why: folders didn't say what an app may rely on, and apps reached into platform details (spec #119, issue #121).
- 2026-10-20: Projects share compiler options via root `tsconfig.shared.json`, a name Nx doesn't read, instead of each repeating them.
- 2026-10-18: A package a platform ADR requires every app to use starts in `packages/` before a second app exists, so every app gets the same behaviour from the first ([ADR-PLAT-005](ADR-PLAT-005-app-settings.md), issue #40).
- 2026-10-16: Accepted. Nx on npm workspaces, apps in `apps/`, code shared by more than one app in `packages/` once a second app needs it, boundaries checked from the Nx project graph.
