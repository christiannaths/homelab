# Our own sign-in on Better Auth (spike)

A throwaway spike: can an accounts service of our own, built on [Better Auth](https://better-auth.com), take VoidAuth's place behind the homelab gateway (ADR-PLAT-004), with pages that are entirely ours and email as the sign-in identifier? It is left out of repo-wide runs ([ADR-PLAT-003](../../docs/adr/ADR-PLAT-003-proof-of-concept-code.md)).

The answers, with evidence, are in [FINDINGS.md](FINDINGS.md).

## Shape

```text
browser ──https──▶ gateway (Caddy) ──▶ accounts.home.test         accounts service (host)
                        │
                        ├─ asks the accounts service (forward_auth) ──▶ 200 + Remote-* headers, or a redirect
                        ├──▶ notes.home.test                      stand-in: echoes the Remote-* headers
                        └──▶ encyclopedia.home.test               stand-in: echoes the Remote-* headers
```

- `accounts` (`better-auth-sign-in-poc-accounts`): a Hono server on Better Auth 1.7 and SQLite (`node:sqlite`). It has email and password sign-in, passkeys (`@better-auth/passkey`), an authenticator app (Better Auth's `twoFactor`), invite links that carry the apps a person may open, and `GET /api/authz/forward-auth`, the endpoint the gateway asks about every request. Its pages are server-rendered HTML in `src/pages.ts` with one small script, `src/public/pages.js`.
- `e2e` (`better-auth-sign-in-poc-e2e`): Playwright in Chromium, through the gateway. The gateway uses the homelab's own sign-in check, [`packages/gateway/signed-in.caddyfile`](../../packages/gateway/signed-in.caddyfile), unchanged; only its upstream points at the accounts service. Global setup starts the accounts service on the host and the gateway in Docker, creates the first admin from the link the service prints, and invites each test person with their apps.

## Run it

```sh
cd spikes/better-auth-sign-in-poc/accounts
HOMELAB_DOMAIN=home.test ACCOUNTS_URL=https://accounts.home.test:8473 \
  BETTER_AUTH_SECRET=$(openssl rand -hex 32) npm start
```

On an empty database it prints a first-run link that creates the admin account. The service expects to be reached only through the gateway, so run it with `e2e/compose.yaml` (`DATA_DIR=./data ACCOUNTS_PORT=3000 docker compose -f e2e/compose.yaml up`) and point `accounts.home.test`, `notes.home.test` and `encyclopedia.home.test` at this machine. The admin endpoints (`POST /admin/invites`, `PUT /admin/people/:email/groups`) take JSON from a page on the accounts service; there is no admin UI.

## Tests

```sh
npx nx run-many -t typecheck test -p 'tag:scope:better-auth-sign-in-poc'   # no Docker
npx nx e2e better-auth-sign-in-poc-e2e   # Docker; uses ports 8473 and 4130; under a minute
```

Set `KEEP_STACK=1` to leave the gateway running afterwards, and `PLAYWRIGHT_CHROMIUM_PATH` to use an installed Chromium.
