# ADR-PLAT-005. How does an app get its settings from the person installing it?

- Status: Accepted
- Date: 2026-10-18
- Depends on: [ADR-PLAT-001](ADR-PLAT-001-toolchain.md), [ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)
- Dependency of: [ADR-ENCY-001](../../apps/encyclopedia/docs/adr/ADR-ENCY-001-content-source.md)

## Context

Anyone installs the apps from published images, often via Unraid, TrueNAS, Synology, Portainer or Coolify, which show environment variables as form fields; settings cover data location, public URL, sign-in and their secrets. A bad setting should fail at deploy, not on first use of the feature it breaks, and a secret must never reach a log. Every app behaves the same, so installers learn it once.

## Decision

- **Settings belong to the installer.** No deployment's settings or secrets are committed.
- **Environment variables only.** Each app asks for as few as it can and derives or defaults the rest (e.g. data directory `/data`).
- **Any setting can come from a file:** for `NAME`, `NAME_FILE` is a path to the value (as Docker and Kubernetes secrets provide). Both set is an error. One trailing newline is trimmed.
- **Plain names**, no app prefix (`PORT`, `DATA_DIR`, `HOMELAB_URL`), since each app has its own container. A setting shared by apps means the same in each.
- **Read once at startup, never at build time.** One image serves every installer; a web client gets settings from its server at runtime.
- **A bad configuration stops the app:** before serving, it checks every setting and, if any is missing or invalid, exits with one message listing every problem. The message names settings and rules and must never contain a value.
- **Zod checks settings** via shared `@homelab/settings` (`scope:shared`, `platform:node`), which resolves `NAME_FILE`, runs the app's schema and builds the startup message. Every app's server must read settings through it.
- **Each app commits a `.env.example`** listing every setting it reads, each commented. Developers keep a git-ignored `.env`, which Nx loads into the app's tasks.
- **Tests never read the environment**; they pass settings to the app's settings reader.

## Alternatives considered

- **Encrypted settings in the repo (Rails)**: fits a repo that is its own deployment; here each installer brings their own.
- **One config file + one secrets file per app** (`NOTES_CONFIG_FILE`, `NOTES_SECRETS_FILE`): hosting tools fill env vars, not files; a combined secrets file can't come straight from Docker or Kubernetes secrets; file-configured apps end up taking env overrides too.
- **dotenvx**: loads, validates, encrypts `.env` and masks secrets, but starts by default when settings are missing or undecryptable, its hosted-key and password-manager integrations must be switched off, it depends on `undici@^6` against the repo's 7.30.1 override, and its encryption mainly serves in-repo settings.
- **envalid**: its startup message repeats each invalid value, so a malformed secret would be logged.
- **`@t3-oss/env-core`**: separates browser and server settings for frontend frameworks; on a server it adds nothing over Zod.
- **Hand-written checker**: no dependency, but every conversion and message is ours to maintain, and Zod is what a server likely adopts for API input anyway.

## Evidence

- [`research/settings-from-environment.md`](../research/settings-from-environment.md): each library tested on Node 26.12.0 against these requirements, incl. startup messages for the same bad settings.
- Zod 4.6.7 is one package with no dependencies; `z.prettifyError` names every failing setting without its value.
- Nx 23.3.0 loads a project folder's `.env` into every task for that project, tests included.
- Notes server already reads plain-named `PORT`, `DATA_DIR` from `process.env`, moving to `@homelab/settings` once it exists.

## Consequences

- `@homelab/settings` starts in `packages/` before a second app exists, an exception recorded in [ADR-PLAT-002](ADR-PLAT-002-repo-structure.md).
- Zod is a runtime dependency of every app's server.
- No `nx.json` target lists env vars as cache inputs; no build or test output depends on settings.
- An installer running several apps from one `.env` splits it per app (names aren't prefixed).
- Settings are flat strings. An app needing structured settings (lists, nested groups) may add an optional settings file, checked by the same schema, with env vars taking precedence; that change is made in this ADR.
