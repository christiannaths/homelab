# VoidAuth ProxyAuth behind one gateway (spike)

A throwaway spike: does [VoidAuth](https://github.com/voidauth/voidauth)'s ProxyAuth mode give the homelab the "Google accounts" experience? One place to sign in, each person sees only the apps the admin granted them, and signing out once signs them out of every app on that device. It is left out of repo-wide runs ([ADR-PLAT-003](../../docs/adr/ADR-PLAT-003-proof-of-concept-code.md)).

The answers, with evidence, are in [FINDINGS.md](FINDINGS.md).

VoidAuth is AGPL-3.0. This spike runs its official image unmodified and contains none of its code.

## Shape

```text
browser ──https──▶ gateway (Caddy) ──▶ auth.home.test          VoidAuth
                        │
                        ├─ asks VoidAuth (forward_auth) ──▶ 200 + Remote-* headers, or a redirect
                        ├──▶ notes.home.test               stand-in app
                        └──▶ encyclopedia.home.test        the same stand-in app
```

- `compose.yaml`: the gateway, VoidAuth `1.16.0` pinned by digest, and the stand-in app twice. Only the gateway publishes a port.
- `gateway/gateway.caddyfile`: one site per hostname. Each app site asks VoidAuth before passing a request on, after deleting any `Remote-*` headers the browser sent.
- `app` (`voidauth-proxyauth-poc-app`): a stand-in homelab app with no sign-in code. It reads the person from the gateway's headers (`person.ts`), serves an offline-capable page with a service worker, `/api/me`, and a `/sync` WebSocket.
- `e2e` (`voidauth-proxyauth-poc-e2e`): Playwright in Chromium, through the gateway. Global setup starts the stack with empty data and sets it up as a homelab admin would: the first-run admin password, one group per app, one ProxyAuth domain per app, and an invite per person carrying their groups.

## Run it

```sh
cd spikes/voidauth-proxyauth-poc
export STORAGE_KEY=$(openssl rand -hex 24)   # keep it: it encrypts VoidAuth's secrets
docker compose up -d
docker compose logs voidauth                 # open the first-run link, set auth_admin's password
```

Point `auth.home.test`, `notes.home.test` and `encyclopedia.home.test` at this machine (a hosts file entry each), and open <https://auth.home.test:8443/>. The certificates come from Caddy's own CA (in `data/caddy`), so the browser warns until you trust it. In VoidAuth's admin pages, add the groups `notes`, `notes-admins` and `encyclopedia`, and the ProxyAuth domains `notes.home.test/*` (groups `notes`, `notes-admins`) and `encyclopedia.home.test/*` (group `encyclopedia`). Then invite people with the groups they should have. Set `HOMELAB_DOMAIN` and `GATEWAY_PORT` to use another domain or port.

## Tests

```sh
npx nx run-many -t typecheck test -p 'tag:scope:voidauth-proxyauth-poc'   # no Docker
npx nx e2e voidauth-proxyauth-poc-e2e   # Docker; uses port 8453; about two minutes
```

Set `KEEP_STACK=1` to leave the stack running afterwards, and `PLAYWRIGHT_CHROMIUM_PATH` to use an installed Chromium.
