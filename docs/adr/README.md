# Architecture Decision Records: platform

Decisions for **every app** and the platform around them: toolchain, repo layout, sign-in, the app contract and, later, deployment. Each app keeps its own in `apps/<app>/docs/adr/`:

| Namespace | Scope | Folder |
| --- | --- | --- |
| `PLAT` | Every app | `docs/adr/` (this folder) |
| `NOTE` | Notes (LocalNotion) | [`apps/notes/docs/adr/`](../../apps/notes/docs/adr/README.md) |
| `ENCY` | Encyclopedia | [`apps/encyclopedia/docs/adr/`](../../apps/encyclopedia/docs/adr/README.md) |

One ADR per topic, always stating the current decision; open questions go in **Not decided yet**. Format and editing rules: the [`adr` skill](../../.agents/skills/adr/SKILL.md).

| ID | Problem | Decision | Status |
| --- | --- | --- | --- |
| [ADR-PLAT-001](ADR-PLAT-001-toolchain.md) | How is the code written, run and packaged? | TypeScript on Node.js 26, npm workspaces | Accepted |
| [ADR-PLAT-002](ADR-PLAT-002-repo-structure.md) | How do several independent apps share one repo? | Nx monorepo: independent apps in `apps/`, the platform in `platform/`, libraries apps may use in `packages/`; an app never depends on another app or the platform | Accepted |
| [ADR-PLAT-003](ADR-PLAT-003-proof-of-concept-code.md) | How is proof-of-concept code kept apart from the apps? | Spikes live in `spikes/`, skipped by repo-wide builds and tests but formatted and linted | Accepted |
| [ADR-PLAT-004](ADR-PLAT-004-sign-in.md) | How do people sign in to the homelab's apps? | One gateway asks the homelab's own accounts service (Better Auth) about every app request: one email sign-in and sign-out cover every app; no public sign-up | Accepted |
| [ADR-PLAT-005](ADR-PLAT-005-app-settings.md) | How does an app get its settings from the person installing it? | Environment variables only, each also readable from a `_FILE`, checked by Zod at startup via `@homelab/settings` | Accepted |
| [ADR-PLAT-006](ADR-PLAT-006-code-quality.md) | How is code kept consistently formatted and free of common mistakes? | Prettier formats; Oxlint, markdownlint, Stylelint and ls-lint lint; in `npm run check` and a pre-commit hook | Accepted |
| [ADR-PLAT-007](ADR-PLAT-007-licensing.md) | How is the homelab's code licensed? | MIT; an app may carry its own licence when a dependency requires it | Accepted |
| [ADR-PLAT-008](ADR-PLAT-008-work-previews.md) | How is work seen running before it merges? | Each open PR, and staging (following `main`), gets a whole homelab on Fly.io under a preview domain, with open test accounts | Accepted |
| [ADR-PLAT-009](ADR-PLAT-009-app-contract.md) | How does an app plug into the homelab? | The app contract alone: own subdomain, manifest and icons readable signed out, identity headers on every request, no signed-out requests, switcher injected by the gateway; apps found by manifest | Accepted |

## Not decided yet

Deliberately **not** locked in. **Human**: a product decision or real-device testing. **AI**: work that can be automated or built in the sandbox.

| Topic | Where it stands | What would settle it | Who |
| --- | --- | --- | --- |
| **What an app ships as:** one container, a `/data` volume, a health endpoint (plugging in: [ADR-PLAT-009](ADR-PLAT-009-app-contract.md); settings: [ADR-PLAT-005](ADR-PLAT-005-app-settings.md)) | Notes works this way ([ADR-NOTE-004](../../apps/notes/docs/adr/ADR-NOTE-004-hosting-and-scale.md)), as a Notes decision | An ADR, with the deploy script | AI, then human review |
| **Deployment:** pick apps, point at a host, run one deploy script | Each app has its own `compose.yaml` | A deploy script and config file, tested on a VM | AI, then human |
| **TLS modes:** a real domain with DNS-01, a private CA, or Tailscale | Documented for Notes only ([ADR-NOTE-003](../../apps/notes/docs/adr/ADR-NOTE-003-app-delivery.md)) | The deploy script supporting each, checked on an iPhone | AI, then human |
| **Where images are built** for `amd64` and `arm64` | Built locally | CI pushing to a registry (e.g. GHCR), or building on the host | Human |
