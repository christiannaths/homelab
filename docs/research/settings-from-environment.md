# Reading and checking app settings from environment variables

**Question** ([issue #40](https://github.com/christiannaths/homelab/issues/40)): how should every app in this repo read and check its settings, given TypeScript run directly by Node 26 ([ADR-PLAT-001](../adr/ADR-PLAT-001-toolchain.md)), few runtime dependencies with no native code or install scripts, and the repo layout in [ADR-PLAT-002](../adr/ADR-PLAT-002-repo-structure.md)?

**Outcome:** [ADR-PLAT-005](../adr/ADR-PLAT-005-app-settings.md). Apps take environment variables only, with an optional `<NAME>_FILE` form for every setting, checked by Zod in a shared `@homelab/settings` package that stops the app at startup with one message naming every problem.

All tests below ran on 2026-10-17 and 2026-10-18 on Node 26.12.0 and Nx 23.3.0, in a scratch folder outside the repo.

## Requirements the options were measured against

These came out of the design discussion in the project thread, in this order:

1. **Bring your own settings.** The apps are for anyone to install. No deployment's settings or secrets live in the repo, which rules out committed encrypted credentials in the style of Rails.
2. **Environment variables only, kept few by defaults.** Hosting tools (Unraid templates, TrueNAS, Synology, Portainer, Coolify) present environment variables as form fields; a config file has to be written and mounted by hand.
3. **Any setting may come from a file.** `OIDC_CLIENT_SECRET` or `OIDC_CLIENT_SECRET_FILE`, as the official Postgres, MariaDB and Nextcloud images do, so that Docker and Kubernetes secrets (one value per file) work directly.
4. **Fail fast.** A bad configuration stops the app at startup with one message listing every problem, naming settings and never printing their values.
5. **Read at startup only.** No setting is baked into a build, so one image serves every installer.

## Libraries

None of the candidates supports the `<NAME>_FILE` form, so it is about 10 lines of our own code whichever is chosen.

| Option | Version | Packages installed | Lists every problem at once | Prints values in errors | Notes |
| --- | --- | --- | --- | --- | --- |
| Zod alone | 4.6.7 | 1 (8.2 MB) | Yes | No | Typed result; `z.prettifyError` gives one line per setting |
| envalid | 8.2.0 | 2 (`tslib`) | Yes | **Yes** | `Invalid url: "nope"`: a malformed secret would reach the log |
| `@t3-oss/env-core` + Zod | 0.13.11 | 2 | Yes | No | Built to split browser and server settings in frontend frameworks; adds nothing on a server |
| dotenvx | 2.38.0 | 7 (5.0 MB) | Yes, with an `Envfile` and `strict` | No (masks secrets in logs) | See below |
| Hand-written | — | 0 | Yes | No | About 60 lines to type-convert and report |

Zod's report for five bad settings, with a secret that failed its length rule:

```text
✖ Invalid URL
  → at PUBLIC_URL
✖ Invalid input: expected string, received undefined
  → at OIDC_ISSUER
✖ Too small: expected string to have >=40 characters
  → at OIDC_CLIENT_SECRET
✖ Invalid input: expected number, received NaN
  → at PORT
✖ Invalid option: expected one of "info"|"debug"
  → at LOG_LEVEL
```

envalid's report for the same kind of input repeats the values:

```text
 Invalid environment variables:
    PORT: Invalid port input: "abc"
    PUBLIC_URL: Invalid url: "nope"
 Missing environment variables:
    OIDC_ISSUER: undefined
```

### dotenvx

dotenvx loads `.env` files, encrypts their values with a key pair, validates them against an `Envfile`, and masks secrets in the process's output.

What fits:

- Pure JavaScript, BSD-3-Clause, with no install scripts or native code.
- Decryption with `DOTENV_PRIVATE_KEY` works with the network blocked.
- A value set in the environment overrides the same value in the file.
- With an `Envfile` and `config({ strict: true })`, a bad configuration throws one error naming every problem: `[INVALID_ENV] OIDC_ISSUER is required; PORT must be a valid integer`.
- With an `Envfile`, `console.log(secret)` prints `[REDACTED]`.

What does not:

- It is lenient by default. With the key missing, `config()` logs `DECRYPTION_FAILED` and the app starts with the ciphertext as its settings. Without a `.env` file, strict mode fails with `MISSING_ENV_FILE` unless that error is ignored.
- Integrations with its hosted key service (Armor), 1Password and Bitwarden are on unless switched off with `DOTENVX_NO_*` variables.
- It depends on `undici@^6`, and the repo overrides `undici` to 7.30.1.
- Its encryption protects files at rest, but on the server the key sits beside the file it unlocks. It helps mainly an installer who commits settings to their own repo, which requirement 2 already rules out as the platform default.

## Secrets

- **Files:** every setting accepts `<NAME>_FILE`. Setting both forms is an error. One trailing newline is trimmed from the file's contents, because editors and `echo` add one.
- **Logs:** Zod's messages name the setting and the rule, never the value, so the startup report is safe to print.

## Local development and tests

- **Nx loads `.env` files into tasks.** A `.env` in a project's folder is loaded into every task Nx runs for that project, tests included: a probe script run with `nx run tools:probe` printed a value set only in `tools/.env`.
- Each app commits a `.env.example`, which also tells installers which settings exist. Each developer keeps a personal `.env`, ignored by git, which Nx loads for `npm run dev`.
- Tests never read the environment: they pass settings to the reader directly, so a developer's `.env` or shell cannot change a result.

## Nx caching

Settings are read at startup only and never at build time, so no build or test output depends on them, and `nx.json` declares no environment inputs. A web client that needs a setting, such as the public URL, gets it from its server at runtime instead of from the bundler, which would otherwise force every installer to rebuild the image.

## Rejected: one config file and one secrets file per app

`NOTES_CONFIG_FILE` pointing at a JSON or YAML file, plus `NOTES_SECRETS_FILE`, was considered and set aside:

- Hosting tools fill in environment variables, not files.
- A combined secrets file cannot come straight from Docker or Kubernetes secrets, which hold one value per file.
- File-configured apps such as Authelia, Gitea and Traefik also accept environment overrides, so the design ends with two systems and a precedence rule.
- JSON has no comments for a hand-edited file, and Node has no built-in YAML parser.

An app that later needs structured settings (lists, nested groups) can add an optional settings file, with environment variables taking precedence and the same Zod schema checking both.
