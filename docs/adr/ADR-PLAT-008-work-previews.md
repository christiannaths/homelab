# ADR-PLAT-008. How is work seen running before it merges?

- Status: Accepted
- Date: 2026-10-23
- Depends on: [ADR-PLAT-002](ADR-PLAT-002-repo-structure.md), [ADR-PLAT-004](ADR-PLAT-004-sign-in.md)
- Dependency of: none

## Context

Cloud Claude threads do most work, and the maintainer often reviews on a phone. A change must be seen as a whole homelab on hostnames sharing one sign-in ([ADR-PLAT-004](ADR-PLAT-004-sign-in.md)), with browser-trusted certificates for offline PWAs. The repo is public, so PR comments and workflow logs are too.

## Decision

- **A preview** is the whole homelab from one branch, public, for trying by hand. Its name is the one varying input: `pr-<number>` (open PR from this repo) or `staging` (long-lived, follows `main`).
- **Fly.io**, region `FLY_REGION` (maintainer: `dfw`). One Fly app, machine and volume per preview, suspended when idle. On boot the gateway starts first and holds requests until services answer.
- **Names and addresses:** Fly app `pr-81-homelab-ops-bz` for `pr-81` under `homelab.ops.bz` (Fly names are global); sites are `<site>.<name>.<preview domain>` (`accounts` + one per app); the session cookie is on `<name>.<preview domain>`, so sign-in covers one preview.
- **Domain** from `PREVIEW_DOMAIN`, DNS at DNSimple. One Fly wildcard certificate, `*.<name>.<preview domain>`; deploy adds the wildcard and `_acme-challenge` CNAMEs via DNSimple, removal deletes them, and setup runs before the image build so issuance overlaps it. New apps need no DNS change.
- **TLS ends at Fly's proxy.** The gateway serves HTTP, routes by hostname, must strip clients' `Remote-*` headers ([ADR-PLAT-004](ADR-PLAT-004-sign-in.md)), and passes only the last non-private `X-Forwarded-For` entry to accounts, so sign-in limits are per client.
- **One image** (`tools/preview/`, [ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)) runs gateway, accounts and every app in one container, since Fly mounts a volume into one container per machine. Reuses `platform/gateway`'s sign-in check and accounts' test-people loader.
- **Open:** test people, App access and passwords from [`tools/test-people.ts`](../../tools/test-people.ts), listed in the PR comment. Sign-in is the real accounts page; no dev shortcuts. `ACCOUNTS_SECRET` is generated per preview as a Fly secret.
- **Data:**

  | Event | Effect |
  | --- | --- |
  | Redeploy, restart | Kept; missing test people added |
  | Reset | Image wipes the volume and restarts with fresh test people; no redeploy |
  | Remove | Volume deleted |
  | Volume has no accounts data | Wiped on start |

- **GitHub Actions:**

  | Trigger | Does |
  | --- | --- |
  | Push to a PR from this repo | Deploys; comment names the commit. Not for forks (no secrets) or PRs not touching the image (e.g. docs only) |
  | PR closed or merged | Removes Fly app, volume, DNS records |
  | Push to `main` touching the image | Deploys staging |
  | `workflow_dispatch` | Another branch to staging (until the next `main` push), or a reset |

  The image builds once on GitHub's runner with cached layers, is tested, then that image goes to Fly.

- **Settings**, set by `tools/preview/setup.sh`:

  | Kind      | Names                                                    |
  | --------- | -------------------------------------------------------- |
  | Secrets   | `FLY_API_TOKEN`, `DNSIMPLE_TOKEN`, `DNSIMPLE_ACCOUNT_ID` |
  | Variables | `PREVIEW_DOMAIN`, `FLY_ORG`, `FLY_REGION`                |

## Alternatives considered

- **Hetzner or DigitalOcean server**: fixed monthly cost plus upkeep; Fly bills only while awake plus disk.
- **Google Cloud Run**: disk wiped when an instance stops.
- **Cloudflare**: no persistent container disk.
- **Host domains** (`fly.dev`, `run.app`…): on the Public Suffix List, so no shared sign-in cookie.
- **`sslip.io`**: not on the PSL, so one shared Let's Encrypt rate limit.
- **Per-hostname certificates**: DNS and certificate work per app per preview, more rate limit.
- **Secret key in links**: links are public, and strangers on test accounts are fine.

## Evidence

- Spec [#76](https://github.com/christiannaths/homelab/issues/76) with the maintainer, 2026-10-20 to 22.
- PR #85's preview: first wake gave 502 (Fly waits ~8 s; gateway listened at 9 s), hence gateway-first.
- `tools/preview/preview.test.ts` (issue #112): test people sign in and reach their apps, forged `Remote-*` ignored, per-client sign-in limits, data survives restart, reset leaves only test people.
- Image uses ~430 MB, so machines get 1 GB (issue #112).

## Consequences

- A new app is added to `tools/dev`, the preview image and test data together.
- Previews differ from real installs (one container, Fly's TLS); such bugs can slip through.
- Anyone can change a preview's data: previews must never hold real data or send real email.
- A few dollars a month, mostly idle volumes; no cap on count.
- Other installers bring their own Fly org, domain and DNSimple account; non-DNSimple DNS needs other tooling.

## Changelog

- 2026-10-23: Own accounts service instead of VoidAuth; `ACCOUNTS_SECRET` replaces `STORAGE_KEY`; existing previews start fresh (issue #112, spec #110).
- 2026-10-23: Faster deploys: one cached build on GitHub's runner, certificate requested before the build, image-untouched changes skip deploys.
- 2026-10-23: Staging follows `main`, so one address always shows what has merged.
- 2026-10-22: Accepted. One preview per PR on Fly.io, plus staging on request.
