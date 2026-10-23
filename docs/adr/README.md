# Architecture Decision Records: platform

Decisions that hold for **every app** in this repo: the toolchain, the repo layout and, later, how apps are built and deployed. Each app records its own decisions in `apps/<app>/docs/adr/`:

| Namespace | Scope | Folder |
| --- | --- | --- |
| `PLAT` | Every app | `docs/adr/` (this folder) |
| `NOTE` | Notes (LocalNotion) | [`apps/notes/docs/adr/`](../../apps/notes/docs/adr/README.md) |
| `ENCY` | Encyclopedia | [`apps/encyclopedia/docs/adr/`](../../apps/encyclopedia/docs/adr/README.md) |

Each topic has exactly one ADR, and it always states the current decision. When a decision changes, its ADR is edited in place and its **Changelog** says what changed and why. Open questions go in **Not decided yet** below. How to write and edit ADRs, and the format they follow, is in the [`adr` skill](../../.agents/skills/adr/SKILL.md).

| ID | Problem | Decision | Status |
| --- | --- | --- | --- |
| [ADR-PLAT-001](ADR-PLAT-001-toolchain.md) | How is the code written, run and packaged? | The code is TypeScript on Node.js 26, in npm workspaces | Accepted |
| [ADR-PLAT-002](ADR-PLAT-002-repo-structure.md) | How do several independent apps share one repo? | The repo is an Nx monorepo of independent apps | Accepted |
| [ADR-PLAT-003](ADR-PLAT-003-proof-of-concept-code.md) | How is proof-of-concept code kept apart from the apps? | Spikes live in spikes/ and stay out of repo-wide builds and tests, but are formatted and linted | Accepted |
| [ADR-PLAT-004](ADR-PLAT-004-sign-in.md) | How do people sign in to the homelab's apps? | One gateway asks VoidAuth about every app request, so one sign-in and one sign-out cover every app; registration is by invite only | Accepted |
| [ADR-PLAT-005](ADR-PLAT-005-app-settings.md) | How does an app get its settings from the person installing it? | Environment variables only, each also readable from a `_FILE`, checked by Zod at startup through `@homelab/settings` | Accepted |
| [ADR-PLAT-006](ADR-PLAT-006-code-quality.md) | How is code kept consistently formatted and free of common mistakes? | Prettier formats, Oxlint, markdownlint, Stylelint and ls-lint lint, in `npm run check` and a pre-commit hook | Accepted |
| [ADR-PLAT-007](ADR-PLAT-007-licensing.md) | How is the homelab's code licensed? | MIT for the repo; an app may carry its own licence when a dependency requires it | Accepted |
| [ADR-PLAT-008](ADR-PLAT-008-work-previews.md) | How is work seen running before it merges? | Each open pull request, and staging (following `main`), gets its own whole homelab on Fly.io under a preview domain, with open test accounts | Accepted |

## Not decided yet

These are deliberately **not** locked in. **Human** means a product decision or testing on real devices; **AI** means work that can be automated or built in the sandbox.

| Topic | Where it stands | What would settle it | Who |
| --- | --- | --- | --- |
| **The app contract:** what every app must provide (one container, a `/data` volume, a health endpoint; settings are covered by [ADR-PLAT-005](ADR-PLAT-005-app-settings.md)) | Notes already works this way ([ADR-NOTE-004](../../apps/notes/docs/adr/ADR-NOTE-004-hosting-and-scale.md)), but as a Notes decision | An ADR | AI, then human review |
| **Deployment:** choosing apps, pointing at a host, running one deploy script | Each app has its own `compose.yaml` | A deploy script and its config file, tested against a VM | AI, then human |
| **TLS modes:** a real domain with DNS-01, a private CA, or Tailscale | Documented for Notes only ([ADR-NOTE-003](../../apps/notes/docs/adr/ADR-NOTE-003-app-delivery.md)) | The deploy script supporting each mode, checked on an iPhone | AI, then human |
| **Where images are built** for `amd64` and `arm64` | Built locally | CI pushing to a registry such as GHCR, or building on the host | Human |
