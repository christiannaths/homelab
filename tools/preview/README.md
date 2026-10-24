# Previews

A preview is the whole homelab, built from one branch and running on Fly.io for trying by hand: one per open pull request, and `staging`, which follows `main`. How previews work, and why, is in [ADR-PLAT-008](../../docs/adr/ADR-PLAT-008-work-previews.md).

## Set up

Previews need a Fly.io organization, a domain whose DNS is at DNSimple, and both services' API tokens in this repository's GitHub settings. Run the setup script once, from anywhere in the repo, and follow it:

```sh
tools/preview/setup.sh
```

It asks for each value in turn, checks the DNSimple token against the domain, and writes these with the GitHub CLI:

| Name | Kind | Holds |
| --- | --- | --- |
| `FLY_API_TOKEN` | Secret | A Fly.io token for the organization, which creates, deploys and destroys preview apps |
| `DNSIMPLE_TOKEN` | Secret | A DNSimple account token, which adds and removes each preview's DNS records |
| `DNSIMPLE_ACCOUNT_ID` | Secret | The DNSimple account that holds the domain |
| `PREVIEW_DOMAIN` | Variable | The domain previews live under, such as `homelab.example.com` |
| `FLY_ORG` | Variable | The Fly.io organization's slug |
| `FLY_REGION` | Variable | The Fly.io region previews run in, such as `dfw` |

None of these go in the repo. The script keeps its answers in `tools/preview/.env` (ignored by git) so a second run offers them again; run it again to replace a token.

## How a preview runs

[`preview.sh`](preview.sh) deploys, resets and removes one preview (and `prepare` sets up its app, certificate and DNS without deploying, which the workflows run first so the certificate issues during the build), and the workflows in [`.github/workflows/`](../../.github/workflows/) call it:

| Workflow | When | Does |
| --- | --- | --- |
| **Preview** | Each push to a pull request from this repo that changes what the image is built from, and its closing | Builds and tests the image, deploys that image as `pr-<number>`, and keeps one comment on the pull request with its links; removes the preview when the pull request closes |
| **Deploy to staging** | Each push to `main` that changes what the image is built from, or run by hand with a branch | Deploys `main` (or that branch) as `staging` and lists the links in the run's summary |
| **Reset preview** | Run by hand, with a preview's name | Wipes that preview's accounts and data and starts it with fresh test people |

Inside the machine, [`start.ts`](start.ts) runs the accounts service, the Home and Notes servers and the gateway ([`Caddyfile`](Caddyfile)), built into the image as in [`packages/gateway`](../../packages/gateway/README.md) so every app's pages get the App switcher, with all their data under `/data`. It then makes the test people in [`tools/test-people.ts`](../test-people.ts) that are missing, with the accounts service's own loader, so people and data changed in the preview are kept across restarts and deploys. A volume with no accounts data (from before the accounts service) is wiped first. `node tools/preview/start.ts reset`, run in the machine, is what **Reset preview** runs over `fly ssh`.

The test people sign in with their email and published password, which the pull request comment lists. The accounts service signs its session cookies with `ACCOUNTS_SECRET`, a Fly secret that `preview.sh prepare` makes once per preview.

## Adding an app

An app added to the homelab is added in four places together, or previews fall behind `npm run dev`:

- `tools/dev/` (the compose service, its subdomain in the accounts service's `HOMELAB_APPS`, and the gateway site).
- [`Dockerfile`](Dockerfile): building the app and copying in what it runs.
- [`Caddyfile`](Caddyfile): its site, importing the sign-in check and the App switcher, and [`start.ts`](start.ts) if it runs a server.
- [`tools/test-people.ts`](../test-people.ts): the app, named after its subdomain, and the App access the test people get to it.

## Test the image

```sh
npm run e2e -w @homelab/tools
```

It needs Docker. It builds the image, runs it with a made-up preview domain the way Fly would, and drives it over HTTP: signing in as each test person by email, the sign-in rate limit, the apps Home lists for each, the sign-in check, forged headers, data surviving a restart, a later start adding only the missing people, and a reset. `KEEP_PREVIEW=1` leaves the container running afterwards, and `PREVIEW_IMAGE=<image>` tests an image already built instead of building one, as the Preview workflow does. Behind a proxy that intercepts TLS, set `NODE_EXTRA_CA_CERTS` to its CA so the build trusts it.
