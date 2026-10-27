# ADR-PLAT-001. How is the code written, run and packaged?

- Status: Accepted
- Date: 2026-10-16
- Depends on: none
- Dependency of: [ADR-ENCY-002](../../apps/encyclopedia/docs/adr/ADR-ENCY-002-article-serving.md), [ADR-NOTE-005](../../apps/notes/docs/adr/ADR-NOTE-005-document-persistence.md), [ADR-NOTE-008](../../apps/notes/docs/adr/ADR-NOTE-008-model-correctness.md), [ADR-NOTE-014](../../apps/notes/docs/adr/ADR-NOTE-014-http-and-accounts.md), [ADR-PLAT-002](ADR-PLAT-002-repo-structure.md), [ADR-PLAT-005](ADR-PLAT-005-app-settings.md), [ADR-PLAT-006](ADR-PLAT-006-code-quality.md)

## Context

Client and server share data-model code and Yjs; a very small team maintains it.

## Decision

- **TypeScript** everywhere: client, server, tests.
- **Node.js 26** (LTS from 2026-10-28) minimum: `engines`/`devEngines` (`npm install` fails on older Node), `mise.toml`, `.nvmrc`, a startup check, the Docker base image.
- **npm**, default `node_modules` layout; install scripts run only if approved in `allowScripts` (`npm approve-scripts`).
- **npm workspaces**, one repo ([ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)).
- No native-compiling dependencies where Node has it built in, e.g. `node:sqlite` ([ADR-NOTE-005](../../apps/notes/docs/adr/ADR-NOTE-005-document-persistence.md)).

## Alternatives considered

- **Bun 1.4.3 runtime**: Hocuspocus's server won't start on it; a workaround failed a client-initiated close in the 2,000-page test.
- **pnpm 12, Yarn 4, Bun's installer**: faster installs (pnpm 1.6 s, Bun 0.6 s vs npm ~11 s warm), but an extra install everywhere, since Node 25+ dropped Corepack.

## Evidence

- Node 25 is EOL (2026-06-01); Node 22.12 lacks `node:sqlite`.
- Full suite passes on Node 26.12.0, and with pnpm, Yarn and Bun's installer.

## Consequences

- Contributors need Node 26 (`mise install` or `nvm install`); the next LTS is a deliberate bump.
- **Every package a workspace imports must be declared in its `package.json`, incl. tools' peer dependencies**: flat `node_modules` hides undeclared imports, and `install-strategy=linked` breaks React peer resolution.
