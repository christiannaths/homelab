# Architecture Decision Records: platform

Decisions that hold for **every app** in this repo: the toolchain, the repo layout and, later, how apps are built and deployed. Each app records its own decisions in `apps/<app>/docs/adr/`:

- **Notes** (LocalNotion): [`apps/notes/docs/adr/`](../../apps/notes/docs/adr/README.md)

Each topic has one ADR that states the current decision; when a decision changes, its ADR is edited in place and a Changelog entry records why. Open questions go in **Not decided yet** below. How to write and edit ADRs, and the format they follow, is in the [`adr` skill](../../.agents/skills/adr/SKILL.md).

| # | Decision | Depends on | Status |
|---|---|---|---|
| [5](0005-typescript-node-26-npm.md) | The code is TypeScript on Node.js 26, in npm workspaces | none | Accepted |
| [15](0015-nx-monorepo.md) | The repo is an Nx monorepo of independent apps | 5 | Accepted |
| [16](0016-spikes-stay-out-of-repo-wide-runs.md) | Spikes live in spikes/ and stay out of repo-wide runs | 15 | Accepted |

## Not decided yet

These are deliberately **not** locked in. **Human** means a product decision or testing on real devices; **AI** means work that can be automated or built in the sandbox.

| Topic | Where it stands | What would settle it | Who |
|---|---|---|---|
| **The app contract:** what every app must provide (one container, a `/data` volume, a health endpoint, environment-only config) | Notes already works this way ([ADR 4](../../apps/notes/docs/adr/0004-homelab-instance.md)), but as a Notes decision | An ADR | AI, then human review |
| **Deployment:** choosing apps, pointing at a host, running one deploy script | Each app has its own `compose.yaml` | A deploy script and its config file, tested against a VM | AI, then human |
| **TLS modes:** a real domain with DNS-01, a private CA, or Tailscale | Documented for Notes only ([ADR 3](../../apps/notes/docs/adr/0003-pwa-client.md)) | The deploy script supporting each mode, checked on an iPhone | AI, then human |
| **Sign-in across apps (SSO)** | Notes uses local password accounts ([ADR 11](../../apps/notes/docs/adr/0011-local-password-accounts.md)) | Building our own `accounts` app on `oidc-provider`, or adopting Authelia | Human (decision), then AI |
| **Where images are built** for `amd64` and `arm64` | Built locally | CI pushing to a registry such as GHCR, or building on the host | Human |
