# Architecture Decision Records: platform

Decisions that hold for **every app** in this repo: the toolchain, the repo layout and, later, how apps are built and deployed. Each app records its own decisions in `apps/<app>/docs/adr/`:

- **Notes** (LocalNotion): [`apps/notes/docs/adr/`](../../apps/notes/docs/adr/README.md)

An ADR is written only once a decision is settled. Open questions go in **Not decided yet** below. An accepted ADR is not edited to change its decision: a new ADR supersedes it.

| # | Decision | Depends on | Status |
|---|---|---|---|
| [5](0005-typescript-node-26-npm.md) | The code is TypeScript on Node.js 26, in npm workspaces | none | Accepted |
| [15](0015-nx-monorepo.md) | The repo is an Nx monorepo of independent apps | 5 | Accepted |

## Format and style

Every ADR uses the same layout:

```md
# N. <Title>

- Status: Proposed | Accepted | Superseded by [ADR M](…)
- Date: YYYY-MM-DD
- Depends on: [ADR A](…), [ADR B](…)   (or "none")
- Dependency of: [ADR C](…)            (or "none")

## Context
## Decision
## Evidence
## Consequences
```

- **Title:** the decision itself, as one declarative sentence in the present tense and sentence case, with no colon and no trailing period. For example, "Yjs stores all shared data", not "Using Yjs" or "CRDT choice".
- **Location:** an ADR that holds for every app goes in `docs/adr/`. One that holds for a single app goes in `apps/<app>/docs/adr/`. When an app's decision turns out to hold for every app, a new platform ADR states it, and the app's ADR then depends on it.
- **Number:** numbers are unique across the whole repo and never reused or changed, so "ADR 12" always means one decision. A new ADR takes the next free number across every ADR folder (`ls docs/adr apps/*/docs/adr`), so each folder's numbers have gaps.
- **File name:** `NNNN-` plus a short slug of the title.
- **Voice:** impersonal and present tense, describing the system as it is ("The server stores…"). No "we", and no contractions. "Must" marks a rule that code review enforces.
- **Context** is a short prose paragraph: the forces and constraints, without the decision.
- **Decision**, **Evidence** and **Consequences** are bullet lists. Evidence cites a PR, a test or a research document, and links research documents. When no spike backs a decision yet, Evidence says so.
- **References:** every mention of another ADR is a link (`[ADR N](file)`), with a relative path when the ADR is in another folder. Each ADR referenced in the body also appears in **Depends on** (decisions this one builds on) or **Dependency of** (decisions built on this one), and the two lists mirror each other across ADRs, including across folders. A platform ADR never depends on an app's ADR.

## Not decided yet

These are deliberately **not** locked in. **Human** means a product decision or testing on real devices; **AI** means work that can be automated or built in the sandbox.

| Topic | Where it stands | What would settle it | Who |
|---|---|---|---|
| **The app contract:** what every app must provide (one container, a `/data` volume, a health endpoint, environment-only config) | Notes already works this way ([ADR 4](../../apps/notes/docs/adr/0004-homelab-instance.md)), but as a Notes decision | An ADR, plus an Nx generator that scaffolds an app following it | AI, then human review |
| **Deployment:** choosing apps, pointing at a host, running one deploy script | Each app has its own `compose.yaml` | A deploy script and its config file, tested against a VM | AI, then human |
| **TLS modes:** a real domain with DNS-01, a private CA, or Tailscale | Documented for Notes only ([ADR 3](../../apps/notes/docs/adr/0003-pwa-client.md)) | The deploy script supporting each mode, checked on an iPhone | AI, then human |
| **Sign-in across apps (SSO)** | Notes uses local password accounts ([ADR 11](../../apps/notes/docs/adr/0011-local-password-accounts.md)) | Building our own `accounts` app on `oidc-provider`, or adopting Authelia | Human (decision), then AI |
| **Where images are built** for `amd64` and `arm64` | Built locally | CI pushing to a registry such as GHCR, or building on the host | Human |
| **The repo's name** | Still `localnotion`, with the `@localnotion/` package scope | Rename on GitHub, then rename the scope | Human |
