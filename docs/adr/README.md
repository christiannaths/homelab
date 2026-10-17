# Architecture Decision Records: platform

Decisions that hold for **every app** in this repo: the toolchain, the repo layout and, later, how apps are built and deployed. Each app records its own decisions in `apps/<app>/docs/adr/`:

- **Notes** (LocalNotion): [`apps/notes/docs/adr/`](../../apps/notes/docs/adr/README.md)

An ADR is written only once a decision is settled. Open questions go in **Not decided yet** below. Each topic has exactly one ADR, and it always states the current decision. When a decision changes, its ADR is edited in place and its **Changelog** says what changed and why (see below), so a reader never has to follow a chain of replaced ADRs.

| # | Decision | Depends on | Status |
|---|---|---|---|
| [5](0005-typescript-node-26-npm.md) | The code is TypeScript on Node.js 26, in npm workspaces | none | Accepted |
| [15](0015-nx-monorepo.md) | The repo is an Nx monorepo of independent apps | 5 | Accepted |
| [16](0016-spikes-stay-out-of-repo-wide-runs.md) | Spikes live in spikes/ and stay out of repo-wide runs | 15 | Accepted |

## Format and style

Every ADR uses the same layout:

```md
# N. <Title>

- Status: Proposed | Accepted | Deprecated
- Date: YYYY-MM-DD
- Depends on: [ADR A](…), [ADR B](…)   (or "none")
- Dependency of: [ADR C](…)            (or "none")

## Context
## Decision
## Evidence
## Consequences
## Changelog
```

- **Status:** `Proposed` while the decision is open for review, `Accepted` once it holds, and `Deprecated` when it is dropped with nothing replacing it. A decision that changes stays `Accepted` and is edited in place.
- **Editing a decision:** when a decision changes, its Title, Context, Decision, Evidence and Consequences, its dependency lists and its Date are rewritten to state the new decision as if it had always been the decision. Git keeps the old wording. A new ADR is written only for a new topic, never to replace an existing one, and two ADRs found to cover one topic are merged into the older number.
- **Date:** the day the current decision was accepted.
- **Changelog:** the last section, a list of dated entries, newest first (`- YYYY-MM-DD: …`). An ADR whose decision has never changed may leave it out. The first time a decision changes, the section is added with an entry for the original decision, saying what it was. Each change to the decision adds an entry saying what changed and **why**, linking the PR or research document that prompted it. It records the reason, not a copy of the old text. Fixing wording, links or dependency lists without changing the decision needs no entry.
- **Title:** the decision itself, as one declarative sentence in the present tense and sentence case, with no colon and no trailing period. For example, "Yjs stores all shared data", not "Using Yjs" or "CRDT choice".
- **Location:** an ADR that holds for every app goes in `docs/adr/`. One that holds for a single app goes in `apps/<app>/docs/adr/`. When an app's decision turns out to hold for every app, a new platform ADR states it, and the app's ADR then depends on it.
- **Number:** numbers are unique IDs across the whole repo and are never reused or changed, so "ADR 12" always means one topic. A number retired by a merge is never given to another ADR. A new ADR takes the next free number across every ADR folder (`ls docs/adr apps/*/docs/adr`), so each folder's numbers have gaps.
- **File name:** `NNNN-` plus a short slug of the title. When the title changes, the slug follows it and every link to the file is updated.
- **Voice:** impersonal and present tense, describing the system as it is ("The server stores…"). No "we", and no contractions. "Must" marks a rule that code review enforces.
- **Context** is a short prose paragraph: the forces and constraints, without the decision.
- **Decision**, **Evidence** and **Consequences** are bullet lists. Evidence cites a PR, a test or a research document, and links research documents. When no spike backs a decision yet, Evidence says so.
- **References:** every mention of another ADR is a link (`[ADR N](file)`), with a relative path when the ADR is in another folder. Each ADR referenced in the body also appears in **Depends on** (decisions this one builds on) or **Dependency of** (decisions built on this one), and the two lists mirror each other across ADRs, including across folders. Each list is in number order, and no ADR appears twice or in both lists. A platform ADR never depends on an app's ADR.

## Not decided yet

These are deliberately **not** locked in. **Human** means a product decision or testing on real devices; **AI** means work that can be automated or built in the sandbox.

| Topic | Where it stands | What would settle it | Who |
|---|---|---|---|
| **The app contract:** what every app must provide (one container, a `/data` volume, a health endpoint, environment-only config) | Notes already works this way ([ADR 4](../../apps/notes/docs/adr/0004-homelab-instance.md)), but as a Notes decision | An ADR | AI, then human review |
| **Deployment:** choosing apps, pointing at a host, running one deploy script | Each app has its own `compose.yaml` | A deploy script and its config file, tested against a VM | AI, then human |
| **TLS modes:** a real domain with DNS-01, a private CA, or Tailscale | Documented for Notes only ([ADR 3](../../apps/notes/docs/adr/0003-pwa-client.md)) | The deploy script supporting each mode, checked on an iPhone | AI, then human |
| **Sign-in across apps (SSO)** | Notes uses local password accounts ([ADR 11](../../apps/notes/docs/adr/0011-local-password-accounts.md)) | Building our own `accounts` app on `oidc-provider`, or adopting Authelia | Human (decision), then AI |
| **Where images are built** for `amd64` and `arm64` | Built locally | CI pushing to a registry such as GHCR, or building on the host | Human |
