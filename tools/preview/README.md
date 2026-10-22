# Previews

A preview is the whole homelab, built from one branch and running on Fly.io for trying by hand: one per open pull request, and `staging` on request. How previews work, and why, is in [ADR-PLAT-008](../../docs/adr/ADR-PLAT-008-work-previews.md).

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

[`preview.sh`](preview.sh) deploys, resets and removes one preview, and the workflows in [`.github/workflows/`](../../.github/workflows/) call it:

| Workflow | When | Does |
| --- | --- | --- |
| **Preview** | Each push to a pull request from this repo, and its closing | Tests the image, deploys `pr-<number>`, and keeps one comment on the pull request with its links; removes the preview when the pull request closes |
| **Deploy to staging** | Run by hand, with a branch | Deploys that branch as `staging` and lists the links in the run's summary |
| **Reset preview** | Run by hand, with a preview's name | Wipes that preview's accounts and data and starts it with fresh test accounts |

Inside the machine, [`start.ts`](start.ts) runs VoidAuth, the Notes server and the gateway ([`Caddyfile`](Caddyfile)), with all their data under `/data`, and loads the test accounts in [`fixtures.ts`](fixtures.ts). `node tools/preview/start.ts reset`, run in the machine, is what **Reset preview** runs over `fly ssh`.

## Adding an app

An app added to the homelab is added in four places together, or previews fall behind `npm run dev`:

- `tools/dev/` (the compose service, the gateway site and the test accounts' groups in `start.ts`).
- [`Dockerfile`](Dockerfile): building the app and copying in what it runs.
- [`Caddyfile`](Caddyfile): its site, importing the sign-in check, and [`start.ts`](start.ts) if it runs a server.
- [`fixtures.ts`](fixtures.ts): the app and the groups the test people get.

## Test the image

```sh
npm run e2e -w @homelab/tools
```

It needs Docker. It builds the image, runs it with a made-up preview domain the way Fly would, and drives it over HTTP: signing in as each test account, the sign-in check, forged headers, data surviving a restart, and a reset. `KEEP_PREVIEW=1` leaves the container running afterwards. Behind a proxy that intercepts TLS, set `NODE_EXTRA_CA_CERTS` to its CA so the build trusts it.
