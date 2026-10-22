# ADR-PLAT-005. How does an app get its settings from the person installing it?

- Status: Accepted
- Date: 2026-10-18
- Depends on: [ADR-PLAT-001](ADR-PLAT-001-toolchain.md), [ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)
- Dependency of: [ADR-ENCY-001](../../apps/encyclopedia/docs/adr/ADR-ENCY-001-content-source.md)

## Context

The homelab's apps are for anyone to install, each with their own settings: where data lives, the public URL, how people sign in, and the secrets that go with them. Installers run the apps from published images, often through hosting tools such as Unraid, TrueNAS, Synology, Portainer or Coolify, which present environment variables as form fields. A mistake in a setting should show up when the app is deployed, not when someone first uses the feature it breaks, and a secret must never end up in a log. Every app needs the same behaviour, so installers learn it once.

## Decision

- **Settings belong to the installer.** No deployment's settings or secrets are committed to the repo.
- **Environment variables are the only source of settings.** Each app asks for as few as it can and derives or defaults the rest, for example a data directory of `/data`.
- **Every setting can also come from a file.** For a setting `NAME`, the app reads `NAME_FILE` as the path to a file holding the value, as Docker and Kubernetes secrets provide. Setting both `NAME` and `NAME_FILE` is an error. One trailing newline is trimmed from the file's contents.
- **Names are plain**, with no app prefix (`PORT`, `DATA_DIR`, `HOMELAB_URL`), because each app runs in its own container. A setting shared by several apps means the same thing in each.
- **Settings are read once, at startup, and never at build time.** One image serves every installer. A web client gets any setting it needs from its server at runtime.
- **A bad configuration stops the app.** Before serving anything, the app checks every setting and, if any is missing or invalid, exits with one message listing every problem. The message names settings and rules and must never contain a setting's value.
- **Zod checks the settings**, through the shared package `@homelab/settings` (`scope:shared`, `platform:node`). The package resolves `NAME_FILE`, runs the app's Zod schema and produces the startup message. Every app's server must read its settings through it.
- **Each app commits a `.env.example`** listing every setting it reads, with a comment on each. Developers keep a personal `.env`, ignored by git, which Nx loads into the app's tasks.
- **Tests never read the environment.** They pass settings to the app's settings reader directly.

## Alternatives considered

- **Encrypted settings committed to the repo, as in Rails.** It fits a repo that is also its own deployment; here each installer brings their own settings, so they cannot live in the repo.
- **One config file and one secrets file per app** (`NOTES_CONFIG_FILE`, `NOTES_SECRETS_FILE`). Hosting tools fill in environment variables, not files, a combined secrets file cannot come straight from Docker or Kubernetes secrets, and file-configured apps end up accepting environment overrides as well.
- **dotenvx.** It loads, validates and encrypts `.env` files and masks secrets in logs, but it starts by default when settings are missing or undecryptable, its hosted-key and password-manager integrations must be switched off, it depends on `undici@^6` against the repo's 7.30.1 override, and its encryption mainly serves settings kept in a repo.
- **envalid.** Its startup message repeats each invalid value, so a malformed secret would be logged.
- **`@t3-oss/env-core`.** It separates browser and server settings for frontend frameworks; on a server it adds nothing over Zod.
- **A hand-written checker with no library.** It adds no dependency, but every type conversion and message would be ours to write and maintain, and Zod is the validator a server is most likely to adopt for its API input anyway.

## Evidence

- [`research/settings-from-environment.md`](../research/settings-from-environment.md): each library tested on Node 26.12.0 against these requirements, including their startup messages for the same bad settings.
- Zod 4.6.7 installs as one package with no dependencies of its own, and `z.prettifyError` reports every failing setting by name without its value.
- On Nx 23.3.0, a `.env` file in a project's folder is loaded into every task Nx runs for that project, tests included.
- The Notes server already reads plain-named settings (`PORT`, `DATA_DIR`) directly from `process.env`, and moves to `@homelab/settings` once it exists.

## Consequences

- `@homelab/settings` is created in `packages/` before a second app exists, an exception recorded in [ADR-PLAT-002](ADR-PLAT-002-repo-structure.md).
- Zod is a runtime dependency of every app's server.
- No `nx.json` target declares environment variables as cache inputs, because no build or test output depends on settings.
- An installer who runs several apps from one `.env` file splits it per app, because names are not prefixed.
- Settings are flat strings. An app that needs structured settings, such as lists or nested groups, may add an optional settings file, checked by the same schema, with environment variables taking precedence; that change is made in this ADR.
