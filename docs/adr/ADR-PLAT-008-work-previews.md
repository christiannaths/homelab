# ADR-PLAT-008. How is work seen running before it merges?

- Status: Accepted
- Date: 2026-10-23
- Depends on: [ADR-PLAT-002](ADR-PLAT-002-repo-structure.md), [ADR-PLAT-004](ADR-PLAT-004-sign-in.md)
- Dependency of: none

## Context

Claude threads in cloud environments do most of the work, and the maintainer often reviews on a phone; seeing a change run meant checking out its branch on a computer and starting `npm run dev` (`tools/dev/`). A change must be seen as a whole homelab (gateway, accounts service, every app) on hostnames sharing one sign-in ([ADR-PLAT-004](ADR-PLAT-004-sign-in.md)), with certificates browsers trust without setup, since apps install as offline PWAs. The repo is public, so anything on a pull request or in a workflow log is public.

## Decision

- **A preview** is the whole homelab built from one branch, on the public internet, for trying by hand. Its name is the one input that varies:

  | Name          | For                                          |
  | ------------- | -------------------------------------------- |
  | `pr-<number>` | An open pull request from this repo          |
  | `staging`     | The one long-lived preview, following `main` |

- **Hosting: Fly.io**, region from `FLY_REGION` (`dfw`, Dallas, for the maintainer). One Fly app, one machine, one volume per preview. Idle machines suspend, keeping memory, and resume on the next request. On a full boot the gateway starts first and holds requests until the accounts service and apps answer, so a waking preview is slow, not failing.
- **Fly app name:** preview name and domain, dots as hyphens (`pr-81-homelab-ops-bz` for `pr-81` under `homelab.ops.bz`), since Fly app names are global across users.
- **Addresses:** `<site>.<name>.<preview domain>` (e.g. `notes.pr-81.homelab.ops.bz`); sites are `accounts` plus one per app, as on a real install. The session cookie is on `<name>.<preview domain>`, so signing in covers that preview's apps only.
- **Preview domain:** the `PREVIEW_DOMAIN` setting, never in the repo; DNS at DNSimple.
- **Certificates and DNS:** one Fly-issued wildcard certificate per preview, `*.<name>.<preview domain>`. Deploy adds two CNAMEs via the DNSimple API (the wildcard → the app's `<app>.fly.dev`, and the `_acme-challenge` one Fly validates through); removal deletes them. A new app needs no DNS or certificate change. Workflows set up app, certificate and DNS before building the image, so the minutes-long issuance overlaps the build.
- **TLS ends at Fly's proxy.** The gateway serves plain HTTP inside the machine and routes by hostname. It must still strip clients' `Remote-*` headers ([ADR-PLAT-004](ADR-PLAT-004-sign-in.md)). It trusts the client address Fly's proxy adds to `X-Forwarded-For` (the last non-private entry) and passes only that to the accounts service, so sign-in attempts are limited per client, not for everyone at once.
- **One image per preview**, in `tools/preview/` ([ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)): gateway, accounts service and every app's server and web build in one container, all data on one volume, because Fly mounts a volume into only one container per machine. Reuses the gateway's shared sign-in check (`platform/gateway`) and the accounts service's test-people loader ([ADR-PLAT-004](ADR-PLAT-004-sign-in.md)).
- **Previews are open:** same test people, App access and published passwords as `tools/dev` ([`tools/test-people.ts`](../../tools/test-people.ts)), listed by email in the pull request comment. Sign-in is on the accounts service's page, as on a real install; a preview adds no site or shortcut a real install lacks, so dev's one-click sign-in links are off. `ACCOUNTS_SECRET` (signs session cookies) is generated per preview and kept as a Fly secret.
- **Data:**

  | Event | Effect |
  | --- | --- |
  | Redeploy or restart | Data kept; only missing test people are added, others left as they were |
  | Remove | Volume deleted |
  | Reset | Signals the running image: stops every service, wipes the volume, restarts with fresh test people; no redeploy |
  | Start on a volume with no accounts data (e.g. from before the accounts service) | Wiped, so app data never belongs to accounts that no longer exist |

- **GitHub Actions** deploys and removes previews:

  | Trigger | Does |
  | --- | --- |
  | Push to an open pull request from this repo | Deploys its preview; the PR comment names the commit it runs. No preview for forks (no secrets) or for PRs changing nothing the image is built from (e.g. only docs and Markdown) |
  | PR closed or merged | Removes its Fly app, volume and DNS records |
  | Push to `main` changing what the image is built from | Deploys staging, so it always shows what has merged |
  | `workflow_dispatch` | Deploys another branch to staging (the next push to `main` puts it back), or resets a preview |

  The workflow builds the image once on its own runner, layers cached in GitHub's cache so a push that leaves dependencies alone reinstalls nothing, tests it, and pushes that same image to Fly. Fly's builder meant waiting for it and building everything twice.

- **Settings:** GitHub repository settings, set by `tools/preview/setup.sh`:

  | Kind      | Names                                                    |
  | --------- | -------------------------------------------------------- |
  | Secrets   | `FLY_API_TOKEN`, `DNSIMPLE_TOKEN`, `DNSIMPLE_ACCOUNT_ID` |
  | Variables | `PREVIEW_DOMAIN`, `FLY_ORG`, `FLY_REGION`                |

## Alternatives considered

- **A Hetzner or DigitalOcean server for every preview** (first choices): fixed monthly price and a server to keep updated, vs a Fly machine billed only while awake plus disk.
- **Google Cloud Run**: disk wiped whenever an instance stops, so accounts and data wouldn't survive a quiet hour.
- **Cloudflare**: containers have no persistent disk.
- **The host's own domain** (`fly.dev`, `run.app`, `up.railway.app`, `onrender.com`): one hostname per service and on the Public Suffix List, so a preview's apps couldn't share a sign-in cookie.
- **`sslip.io` hostnames**: not on the Public Suffix List, so all its users share one Let's Encrypt rate limit.
- **One certificate per hostname**: each app would add a DNS record and certificate to every preview, and each preview would hit Let's Encrypt's rate limits once per site.
- **A secret key in preview links**: links are posted on public PRs, so the key would be public; the maintainer doesn't mind strangers using test accounts.

## Evidence

- Decided with the maintainer in the previews spec [#76](https://github.com/christiannaths/homelab/issues/76), 2026-10-20 to 2026-10-22; rests on Fly's docs for wildcard certificates, volumes and suspend-when-idle machines.
- PR #85 deployed `pr-85` on 2026-10-22 via the Preview workflow: wildcard certificate issued, each test account got the right apps over HTTPS. Its first wake from a stopped machine gave 502: Fly's proxy waits ~8 s, the gateway listened after 9 s and sign-in after 14 s; hence gateway-first with held requests.
- `tools/preview/preview.test.ts` runs the image in Docker as Fly would (plain HTTP, Fly's `X-Forwarded-Proto` and `X-Forwarded-For`) and passes: email sign-in opens each test person's apps; wrong password refused; attempts limited per client address; no session → accounts sign-in page; forged `Remote-*` ignored; cookie scoped to the preview's domain; no test sign-in links; accounts, sessions and a Notes document survive restart; later start adds only missing test people; volume without accounts data starts fresh; reset leaves only test people (issue #112).
- Running image used ~430 MB summed over its processes, so each machine has 1 GB (issue #112).

## Consequences

- Adding an app means adding it to `tools/dev`, the preview image and the preview's test data together.
- A preview differs from `tools/dev` and a real install (one container, Fly's proxy instead of the gateway's own TLS); a bug depending on that can pass in a preview.
- Anyone can sign in to a preview and change its data. Previews must never hold real data or send real email.
- A few dollars a month at expected use, mostly stopped machines' volumes; nothing limits how many exist at once.
- Another installer brings their own Fly organization, domain and DNSimple account via the setup script; a domain not on DNSimple needs another way to manage records.

## Changelog

- 2026-10-23: Previews run the homelab's own accounts service instead of VoidAuth, same test people signing in by email, `ACCOUNTS_SECRET` replacing VoidAuth's `STORAGE_KEY`. Staging and existing previews start fresh on next deploy, as their data belonged to VoidAuth's accounts (issue #112, spec #110).
- 2026-10-23: Faster deploys: build once on GitHub's runner with cached layers and deploy the tested image; request a new preview's certificate before the build so it issues meanwhile; PRs or `main` pushes changing nothing in the image (docs only) deploy nothing.
- 2026-10-23: Staging follows `main`: every push to `main` deploys it, so the maintainer always has one address showing what has merged. Deploying another branch there stays available by hand.
- 2026-10-22: Accepted. One preview per pull request on Fly.io, plus a staging preview deployed only on request.
