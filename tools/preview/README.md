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
