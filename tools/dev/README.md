# The homelab on your machine

Everything so far (gateway, [accounts](../../platform/accounts), [Home](../../platform/home/README.md), [Notes](../../apps/notes/README.md), [Encyclopedia](../../apps/encyclopedia/README.md)) under `homelab.localhost`, with test people. Not for real use: passwords are public and certificates come from the gateway's own CA.

## Start it

Needs Docker, Node 26, `npm install`. From the repo root:

```sh
npm run dev
```

Builds web clients, starts containers (logs streaming), adds missing test people, prints addresses and one-click sign-in links. Reruns keep data; Ctrl+C stops, keeping data. `.localhost` resolves locally, no hosts file.

**Trust the gateway's CA** (once; needed to install apps and open them offline, since service workers won't register with a certificate warning). macOS:

```sh
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain tools/dev/data/gateway-root-ca.crt
```

Restart the browser. Firefox: Settings → Privacy & Security → Certificates → View Certificates → Authorities → Import. `npm run dev:reset` makes a new CA.

## Addresses and accounts

| Address                                        |                          |
| ---------------------------------------------- | ------------------------ |
| <https://home.homelab.localhost:8443/>         | Home                     |
| <https://notes.homelab.localhost:8443/>        | Notes                    |
| <https://encyclopedia.homelab.localhost:8443/> | Encyclopedia             |
| <https://accounts.homelab.localhost:8443/>     | Sign-in and account page |

| Email | Password | Gets |
| --- | --- | --- |
| `admin@example.com` | `violet-quartz-harbour-71` | Homelab admin; Notes owner, Encyclopedia |
| `ada@example.com` | `lantern-meadow-copper-48` | Notes owner, Encyclopedia |
| `dana@example.com` | `quartz-ember-willow-27` | Notes member |
| `bob@example.com` | `harbour-violet-thistle-93` | No apps: Home only |

People: [`tools/test-people.ts`](../test-people.ts), shared with previews. One-click links (e.g. <https://accounts.homelab.localhost:8443/test-sign-in?email=ada%40example.com>) sign in with no password and open Home; they need `TEST_SIGN_IN_LINKS=on` (set in `compose.yaml`, refused in production). Sign out from the switcher.

## Start over

```sh
npm run dev:reset   # deletes everything; the next `npm run dev` starts from empty
```

`HOMELAB_URL` (default `https://homelab.localhost:8443`) changes domain or port; keep it the same across runs. Servers run from this checkout, so restart one to pick up changes (`docker compose -f tools/dev/compose.yaml restart notes`); `npm run dev` rebuilds clients and the gateway.

## Files

| File |  |
| --- | --- |
| `compose.yaml` | Containers; only the gateway publishes a port (apps trust `Remote-*`). Accounts reads manifests via the gateway, trusting the CA in its volume |
| `.env` | `ACCOUNTS_SECRET` (made on first run, deleted by `dev:reset`) and the last `HOMELAB_URL` with derived hostname and port, for hand-run `docker compose` |
| `gateway.caddyfile` | One site per hostname, importing [`platform/gateway`](../../platform/gateway/README.md)'s snippets; image built first as `homelab-gateway` |
| `start.ts` | Behind `npm run dev` and `npm run dev:reset` |
