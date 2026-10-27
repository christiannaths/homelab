# Previews

The whole homelab from one branch on Fly.io: `pr-<number>` per open pull request, and `staging` following `main`. Design: [ADR-PLAT-008](../../docs/adr/ADR-PLAT-008-work-previews.md).

## Set up

Needs a Fly.io org, a domain with DNS at DNSimple, and their API tokens. Run once and follow the prompts:

```sh
tools/preview/setup.sh
```

It checks the DNSimple token against the domain and writes, via `gh`:

| Name | Kind | Holds |
| --- | --- | --- |
| `FLY_API_TOKEN` | Secret | Fly.io org token (creates, deploys, destroys preview apps) |
| `DNSIMPLE_TOKEN` | Secret | DNSimple account token (each preview's DNS records) |
| `DNSIMPLE_ACCOUNT_ID` | Secret | DNSimple account holding the domain |
| `PREVIEW_DOMAIN` | Variable | Parent domain, e.g. `homelab.example.com` |
| `FLY_ORG` | Variable | Fly.io org slug |
| `FLY_REGION` | Variable | Fly.io region, e.g. `dfw` |

Answers are remembered in git-ignored `tools/preview/.env`; rerun to replace a token.

## How a preview runs

[`preview.sh`](preview.sh) deploys, resets and removes a preview; `prepare` creates app, certificate and DNS first so the certificate issues during the build. [Workflows](../../.github/workflows/):

| Workflow | When | Does |
| --- | --- | --- |
| **Preview** | Push to a same-repo PR touching image inputs; PR close | Builds and tests the image, deploys `pr-<number>`, keeps one PR comment with links; removes on close |
| **Deploy to staging** | Push to `main` touching image inputs, or by hand with a branch | Deploys as `staging`; links in the run summary |
| **Reset preview** | By hand, with a name | Wipes accounts and data; fresh test people |

In the machine, [`start.ts`](start.ts) runs accounts, Notes and the gateway ([`Caddyfile`](Caddyfile), built as in [`platform/gateway`](../../platform/gateway/README.md)), data in `/data`. Each start adds only missing [test people](../test-people.ts), so preview changes survive restarts and deploys; a volume without accounts data is wiped first. **Reset preview** runs `node tools/preview/start.ts reset` over `fly ssh`. Test people's passwords are in the PR comment; `ACCOUNTS_SECRET` is a Fly secret made once by `preview.sh prepare`.

## Adding an app

Change all four together, or previews fall behind `npm run dev`:

| Where | What |
| --- | --- |
| `tools/dev/` | Compose service, `HOMELAB_APPS` entry, gateway site |
| [`Dockerfile`](Dockerfile) | Build the app; copy in what it runs |
| [`Caddyfile`](Caddyfile) | Its site with both snippets; [`start.ts`](start.ts) if it has a server |
| [`tools/test-people.ts`](../test-people.ts) | The app (by subdomain) and test people's access |

## Test the image

```sh
npm run e2e -w @homelab/tools
```

Docker. Runs the image with a fake domain as Fly would, over HTTP: each person's sign-in, rate limit, apps per person, sign-in check, forged headers, restart persistence, adding missing people, reset.

| Variable                | Effect                                            |
| ----------------------- | ------------------------------------------------- |
| `KEEP_PREVIEW=1`        | Keep the container                                |
| `PREVIEW_IMAGE=<image>` | Test a built image (as the Preview workflow does) |
| `NODE_EXTRA_CA_CERTS`   | TLS-intercepting proxy's CA for the build         |
