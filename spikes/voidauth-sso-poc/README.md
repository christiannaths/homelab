# VoidAuth as the homelab's single sign-on (spike)

A throwaway spike for [issue #35](https://github.com/christiannaths/homelab/issues/35): can [VoidAuth](https://github.com/voidauth/voidauth) be the shared sign-in for every homelab app, starting with Notes? It is left out of repo-wide runs ([ADR-PLAT-003](../../docs/adr/ADR-PLAT-003-proof-of-concept-code.md)).

The answers, with evidence, are in [FINDINGS.md](FINDINGS.md).

> Status: **done, waiting on a decision.** Freeze it once a platform ADR on sign-in across apps records the outcome.

VoidAuth is AGPL-3.0. This spike runs its official image unmodified and contains none of its code: the tests drive it over HTTP, the way its own web UI does.

## Packages
- `compose.yaml`: VoidAuth `1.16.0`, pinned by digest, on SQLite. Notes is declared as an OIDC app with environment variables.
- `server` (`voidauth-sso-poc-server`): a stand-in for Notes' server. It signs people in through VoidAuth (authorization code with PKCE, on `fetch` and `jose`), keeps its own member list and invites (`access.ts`), sets its own 30-day device cookie (`devices.ts`), and accepts that cookie on a `/sync` WebSocket. `voidauth-admin.ts` creates VoidAuth invites by signing in as a VoidAuth admin.
- `e2e` (`voidauth-sso-poc-e2e`): Vitest against the real container. Global setup starts VoidAuth with empty data, takes the first-run link from its log and sets the admin password. One file per question. `rate-limit.test.ts` runs its own VoidAuth from `e2e/rate-limit.compose.yaml`, on host networking.

## Run it
```sh
cd spikes/voidauth-sso-poc
export STORAGE_KEY=$(openssl rand -hex 24)   # keep it: it encrypts VoidAuth's secrets
docker compose up -d
docker compose logs voidauth          # open the first-run link, set auth_admin's password
VOIDAUTH_ADMIN_USER=auth_admin VOIDAUTH_ADMIN_PASSWORD=… npm start -w @homelab/voidauth-sso-poc-server
```
Then open http://localhost:4100/login. Data is kept in `spikes/voidauth-sso-poc/data`.

## Tests
```sh
npx nx run-many -t typecheck test -p 'tag:scope:voidauth-sso-poc'   # unit tests, no Docker
npx nx e2e voidauth-sso-poc-e2e   # Docker; uses ports 3310, 4110, 3320 and 3321; about a minute
```
Set `KEEP_VOIDAUTH=1` to leave the container running afterwards.
