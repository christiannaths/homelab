# ADR-PLAT-008. How is work seen running before it merges?

- Status: Accepted
- Date: 2026-10-22
- Depends on: [ADR-PLAT-002](ADR-PLAT-002-repo-structure.md), [ADR-PLAT-004](ADR-PLAT-004-sign-in.md)
- Dependency of: none

## Context

Most work on the homelab is done by Claude threads in cloud environments, and the maintainer often reviews it away from a computer, on a phone. Seeing a change run meant checking out its branch on a computer and starting the local stack (`npm run dev`, in `tools/dev/`). A change has to be seen as a whole homelab: the gateway, VoidAuth and every app, on hostnames that share one sign-in ([ADR-PLAT-004](ADR-PLAT-004-sign-in.md)). Apps are installed as offline PWAs, so a preview needs certificates that browsers trust without setup. The repo is public, so anything posted on a pull request or printed in a workflow log is public too.

## Decision

- **A preview** is the whole homelab, built from one branch, running on the public internet for trying by hand. Each preview has a name, which is the one input that varies between previews:
  - `pr-<number>` for an open pull request from this repo.
  - `staging` for the one preview that a branch is deployed to only on request.
- **Hosting is Fly.io**, in the region named by the `FLY_REGION` setting (`dfw`, Dallas, for the maintainer). Each preview is one Fly app with one machine and one volume. The machine stops when idle and starts again on the next request.
- **The Fly app** is named after the preview's name and domain, with dots as hyphens (`pr-81-homelab-ops-bz` for `pr-81` under `homelab.ops.bz`), because Fly app names are shared by every Fly user.
- **Addresses** are `<site>.<name>.<preview domain>`, for example `notes.pr-81.homelab.ops.bz`, with the site `accounts` for VoidAuth and one per app, the same sites as a real install. VoidAuth's session domain is `<name>.<preview domain>`, so signing in to one preview signs in to that preview's apps only, as on a real install.
- **The preview domain** is a setting (`PREVIEW_DOMAIN`), never a value in the repo. Its DNS is hosted at DNSimple.
- **Certificates and DNS:** each preview has one wildcard certificate, `*.<name>.<preview domain>`, issued by Fly. The deploy adds two CNAME records through the DNSimple API, the wildcard one pointing at the Fly app's own `<app>.fly.dev` name and the `_acme-challenge` one that Fly validates the certificate through, and the removal deletes them. A new app therefore needs no DNS or certificate change.
- **TLS ends at Fly's proxy.** The preview's gateway serves plain HTTP inside the machine and routes by hostname. It must still strip `Remote-*` request headers from clients ([ADR-PLAT-004](ADR-PLAT-004-sign-in.md)).
- **One image per preview** runs the gateway, VoidAuth, and every app's server and web build in one container, with all their data on the one volume, because Fly mounts a volume into only one container per machine. It lives in `tools/preview/` ([ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)) and reuses the gateway's shared sign-in check (`packages/gateway`), and the VoidAuth fixture loader (`@homelab/voidauth-fixtures`). VoidAuth runs on the Node.js its own image ships, since its native SQLite module is built for that version.
- **Previews are open.** They hold the same test accounts, groups and published passwords as `tools/dev`, which the pull request comment lists. People sign in on VoidAuth's own page, as on a real install: a preview adds no site or shortcut that a real install lacks. VoidAuth's `STORAGE_KEY` is generated per preview and kept as a Fly secret.
- **Data** is kept across deploys and restarts of the same preview: a later start only adds the test accounts that are missing. Removing a preview deletes its volume. Resetting a preview signals the running image, which stops every service, wipes the volume and starts again with fresh test accounts, so a reset needs no redeploy.
- **GitHub Actions** deploys and removes previews:
  - Every push to an open pull request from this repo deploys its preview, and the pull request comment says which commit it runs. Pull requests from forks get no preview, since they get no secrets.
  - Closing or merging a pull request removes its preview: the Fly app, its volume and its DNS records.
  - Deploying a branch to staging and resetting a preview are run by hand (`workflow_dispatch`).
- **Settings** are GitHub repository settings, set by `tools/preview/setup.sh`:
  - Secrets: `FLY_API_TOKEN`, `DNSIMPLE_TOKEN` and `DNSIMPLE_ACCOUNT_ID`.
  - Variables: `PREVIEW_DOMAIN`, `FLY_ORG` and `FLY_REGION`.

## Alternatives considered

- **A Hetzner or DigitalOcean server running every preview**, the first choices. It costs a fixed monthly price and needs a server kept up to date, where a Fly machine costs only while awake plus its disk.
- **Google Cloud Run.** Its disk is wiped whenever an instance stops, so accounts and data would not survive a quiet hour.
- **Cloudflare.** Its containers have no persistent disk.
- **The host's own domain** (`fly.dev`, `run.app`, `up.railway.app`, `onrender.com`). Each gives one hostname per service and is on the Public Suffix List, so a preview's apps could not share VoidAuth's sign-in cookie.
- **`sslip.io` hostnames.** The domain is not on the Public Suffix List, so every user of it shares one Let's Encrypt rate limit.
- **One certificate per hostname** instead of a wildcard. Each app would add a DNS record and a certificate to every preview, and every preview would count against Let's Encrypt's rate limits once per site.
- **A secret key in each preview's links.** The links are posted on public pull requests, so the key would be public too, and the maintainer does not mind strangers signing in to test accounts.

## Evidence

- The decisions were made with the maintainer in the spec for previews, [#76](https://github.com/christiannaths/homelab/issues/76), on 2026-10-20 to 2026-10-22, and rest on Fly's documentation for wildcard certificates, volumes and machines that stop when idle. Nothing has been deployed to Fly yet; the deploy script was run only against stand-ins for `flyctl` and the DNSimple API.
- The image test (`tools/preview/preview.test.ts`) runs the image in Docker as Fly would, over plain HTTP with Fly's `X-Forwarded-Proto`, and passes: signing in as each test account opens the right apps, a request with no session goes to VoidAuth's sign-in, forged `Remote-*` headers are ignored, the session cookie is scoped to the preview's domain, accounts, sessions and a Notes document survive a restart, and a reset leaves only the test accounts.
- The running image used about 450 MB of memory in that test, so each preview's machine has 1 GB.

## Consequences

- Adding an app to the homelab means adding it to `tools/dev`, the preview image and the preview's test data together.
- A preview runs differently from `tools/dev` and from a real install: one container instead of one per service, behind Fly's proxy instead of the gateway's own TLS. A bug that depends on that difference can pass in a preview.
- Anyone can sign in to a preview and change its data. Previews must never hold real data or send real email.
- Previews cost a few dollars a month at the expected use, mostly the volumes of stopped machines, and nothing limits how many exist at once.
- Another installer brings their own Fly organization, domain and DNSimple account by running the setup script; a domain hosted elsewhere than DNSimple needs another way to manage its records.
