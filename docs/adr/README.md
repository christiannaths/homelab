# Architecture Decision Records: platform

Decisions that hold for **every app** in this repo: the toolchain, the repo layout and, later, how apps are built and deployed. Each app records its own decisions in `apps/<app>/docs/adr/`:

| Namespace | Scope | Folder |
|---|---|---|
| `PLAT` | Every app | `docs/adr/` (this folder) |
| `NOTE` | Notes (LocalNotion) | [`apps/notes/docs/adr/`](../../apps/notes/docs/adr/README.md) |

Each topic has exactly one ADR, and it always states the current decision. When a decision changes, its ADR is edited in place and its **Changelog** says what changed and why. Open questions go in **Not decided yet** below. How to write and edit ADRs, and the format they follow, is in the [`adr` skill](../../.agents/skills/adr/SKILL.md).

| ID | Problem | Decision | Status |
|---|---|---|---|
| [ADR-PLAT-001](ADR-PLAT-001-toolchain.md) | How is the code written, run and packaged? | The code is TypeScript on Node.js 26, in npm workspaces | Accepted |
| [ADR-PLAT-002](ADR-PLAT-002-repo-structure.md) | How do several independent apps share one repo? | The repo is an Nx monorepo of independent apps | Accepted |
| [ADR-PLAT-003](ADR-PLAT-003-proof-of-concept-code.md) | How is proof-of-concept code kept apart from the apps? | Spikes live in spikes/ and stay out of repo-wide runs | Accepted |

## Not decided yet

These are deliberately **not** locked in. **Human** means a product decision or testing on real devices; **AI** means work that can be automated or built in the sandbox.

| Topic | Where it stands | What would settle it | Who |
|---|---|---|---|
| **The app contract:** what every app must provide (one container, a `/data` volume, a health endpoint, environment-only config) | Notes already works this way ([ADR-NOTE-004](../../apps/notes/docs/adr/ADR-NOTE-004-hosting-and-scale.md)), but as a Notes decision | An ADR | AI, then human review |
| **Deployment:** choosing apps, pointing at a host, running one deploy script | Each app has its own `compose.yaml` | A deploy script and its config file, tested against a VM | AI, then human |
| **TLS modes:** a real domain with DNS-01, a private CA, or Tailscale | Documented for Notes only ([ADR-NOTE-003](../../apps/notes/docs/adr/ADR-NOTE-003-app-delivery.md)) | The deploy script supporting each mode, checked on an iPhone | AI, then human |
| **Sign-in across apps (SSO)** | Notes uses local password accounts ([ADR-NOTE-009](../../apps/notes/docs/adr/ADR-NOTE-009-identity.md)) | Building our own `accounts` app on `oidc-provider`, or adopting Authelia | Human (decision), then AI |
| **Where images are built** for `amd64` and `arm64` | Built locally | CI pushing to a registry such as GHCR, or building on the host | Human |
