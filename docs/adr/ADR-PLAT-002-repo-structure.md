# ADR-PLAT-002. How do several independent apps share one repo?

- Status: Accepted
- Date: 2026-10-26
- Depends on: [ADR-PLAT-001](ADR-PLAT-001-toolchain.md)
- Dependency of: [ADR-PLAT-003](ADR-PLAT-003-proof-of-concept-code.md), [ADR-PLAT-004](ADR-PLAT-004-sign-in.md), [ADR-PLAT-005](ADR-PLAT-005-app-settings.md), [ADR-PLAT-006](ADR-PLAT-006-code-quality.md), [ADR-PLAT-008](ADR-PLAT-008-work-previews.md), [ADR-PLAT-009](ADR-PLAT-009-app-contract.md)

## Context

Apps share approach and deployment, not features: each ships alone and must never break because another changed. The platform around them signs people in, lists apps and adds the App switcher. Tasks need running in order, rebuilding only what changed, with apps kept from depending on each other or the platform.

## Decision

- **Nx** on npm workspaces ([ADR-PLAT-001](ADR-PLAT-001-toolchain.md)). Tasks stay `package.json` scripts; `nx.json` adds only order and caching; no plugins that infer or wrap tasks.
- **Kinds of code:**

  | Kind | Folder | What | Scope tag |
  | --- | --- | --- | --- |
  | App | `apps/<app>/` | Knows only itself; uses the app contract alone ([ADR-PLAT-009](ADR-PLAT-009-app-contract.md)) | `scope:<app>` |
  | Platform | `platform/` | Code needing platform knowledge (e.g. App access across apps): gateway, accounts, App switcher, manifest reading, `e2e/` | `scope:platform` |
  | Package | `packages/` | Libraries apps may use, e.g. `@homelab/theme` | `scope:shared` |
  | Tools | `tools/` | Repo scripts (`tools` project) | `scope:tools` |

- Optional isn't the test: platform code an install can leave out is still platform.
- A package starts when a second app needs it, or when a platform ADR requires every app to use it (e.g. `@homelab/settings`, [ADR-PLAT-005](ADR-PLAT-005-app-settings.md)).
- **Projects:** an app's workspace packages are `<app>-<package>` (e.g. `notes-web`); platform projects are named after their folder (`accounts`, `gateway`, `platform-e2e`). Each also gets `platform:browser`, `platform:node` or `platform:any`.
- Each app has its own `Dockerfile` and `compose.yaml`, built with plain npm, no Nx.
- **Docs follow the split:** `apps/<app>/docs/` per app; root `docs/` for the platform.
- **Boundaries:** `npm run boundaries` (`tools/check-boundaries.ts`) checks the Nx graph:

  | Project | May depend on |
  | --- | --- |
  | App | own scope, `scope:shared` |
  | Platform | `scope:platform`, `scope:shared`; an app only as an implicit dependency for e2e |
  | `scope:shared` | `scope:shared` |
  | `tools` | `scope:tools`, `scope:platform`, `scope:shared` |

  Cross-platform imports go only into `platform:any`.

- **Scripts are TypeScript**, run by Node 26 type stripping; typechecked with `erasableSyntaxOnly`.
- **No Nx Cloud:** `neverConnectToCloud`, analytics off, local cache; `nx` install script not approved.

## Alternatives considered

- **Turborepo**: adds little, in the maintainer's experience.
- **`@nx/enforce-module-boundaries`**: needs typescript-eslint, which stops at TypeScript 6.0.
- **Optional-means-app**: optional platform code still needs platform knowledge, such as App access across apps, which no app may rely on.
- **Platform services in `apps/`**: the boundary rule couldn't tell an app reaching into the platform from one using a library.

## Evidence

- `tools/check-boundaries.test.ts`: each rule's violations caught. `notes-server` importing `@homelab/app-manifests` exits 1 (issue #121):

  ```text
  $ npm run boundaries
  Module boundary violations:
    - notes-server → app-manifests: scope:notes may depend only on scope:notes or scope:shared
  ```

- Nx 23.3.0 sees source imports only with `pluginsConfig["@nx/js"]` set; without it the check passes everything.
- Nx 23.3.0 can't read a root `tsconfig.json`/`tsconfig.base.json` under TypeScript 7 (no `readConfigFile`): partial graph, exit 0, which the script treats as failure (checked 2026-10-20); hence `tsconfig.shared.json`.

## Consequences

- Repo-wide: `npm run build`/`typecheck`/`test`/`test:e2e` (`nx run-many`); one project: `nx <target> <project>`; CI can use `nx affected`.
- Non-import runtime dependencies (a server serving a web build, platform e2e needing app builds) go in `implicitDependencies`.
- Project `tsconfig.json` files extend root `tsconfig.shared.json`; packages resolve via workspace links, not `paths`.
- `@nx/enforce-module-boundaries` becomes an option once typescript-eslint supports TypeScript 7.
- Packages use the `@homelab/` scope.

## Changelog

- 2026-10-26: Split into apps, platform and packages; platform code moves to `platform/`, and apps may no longer depend on it, because apps had reached into platform details (spec #119, issue #121).
- 2026-10-20: Shared compiler options via root `tsconfig.shared.json`, a name Nx doesn't read.
- 2026-10-18: A package every app must use starts before a second app exists ([ADR-PLAT-005](ADR-PLAT-005-app-settings.md), issue #40).
- 2026-10-16: Accepted. Nx on npm workspaces; `packages/` once a second app needs code; boundaries from the Nx graph.
