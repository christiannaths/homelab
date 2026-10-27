# ADR-PLAT-005. How does an app get its settings from the person installing it?

- Status: Accepted
- Date: 2026-10-18
- Depends on: [ADR-PLAT-001](ADR-PLAT-001-toolchain.md), [ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)
- Dependency of: [ADR-ENCY-001](../../apps/encyclopedia/docs/adr/ADR-ENCY-001-content-source.md)

## Context

Anyone installs the apps from published images, often via tools (Unraid, TrueNAS, Portainer, Coolify…) that show environment variables as form fields. A bad setting should fail at deploy, not on first use, and secrets must never reach a log. All apps behave alike so installers learn it once.

## Decision

- **Installer-owned:** no deployment settings or secrets in the repo.
- **Environment variables only**, as few as possible; derive or default the rest (e.g. data dir `/data`).
- **`NAME_FILE`** may supply any `NAME` from a file (Docker/Kubernetes secrets); both set is an error; one trailing newline trimmed.
- **Plain names**, no app prefix (`PORT`, `DATA_DIR`, `HOMELAB_URL`); a name shared by apps means the same in each.
- **Read once at startup, never at build.** One image for everyone; web clients get settings from their server.
- **Bad config stops the app** before serving, with one message listing every problem, naming settings and rules but never values.
- **Zod via `@homelab/settings`** (`scope:shared`, `platform:node`): resolves `NAME_FILE`, runs the app's schema, builds the message. Every app's server must use it.
- **`.env.example`** committed per app, every setting commented; developers' git-ignored `.env` is loaded by Nx.
- **Tests never read the environment**; they pass settings to the reader.

## Alternatives considered

- **Encrypted settings in the repo (Rails)**: each installer brings their own settings.
- **Config + secrets files per app**: hosting tools fill env vars, not files.
- **dotenvx**: starts by default when settings are missing.
- **envalid**: its error message prints invalid values, leaking secrets.
- **`@t3-oss/env-core`**: adds nothing over Zod on a server.
- **Hand-written checker**: ours to maintain; Zod is likely used for API input anyway.

## Evidence

- [`research/settings-from-environment.md`](../research/settings-from-environment.md): each library tested on Node 26.12.0 with the same bad settings.
- Zod 4.6.7 has no dependencies; `z.prettifyError` names failing settings without values.

## Consequences

- Zod is a runtime dependency of every app server.
- Env vars aren't Nx cache inputs; no build or test output depends on settings.
- One `.env` for several apps must be split per app.
- Settings are flat strings; structured settings would mean an optional settings file under the same schema, env vars winning, decided here.
