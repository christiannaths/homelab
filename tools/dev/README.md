# The homelab on your machine

One command starts everything that exists so far, for trying it by hand: the gateway (the homelab's Caddy build), VoidAuth, [Home](../../apps/home/README.md), [Notes](../../apps/notes/README.md) and the [Encyclopedia](../../apps/encyclopedia/README.md), each on its own hostname under `homelab.localhost`, signed in as one of a few test people.

It is not an install for real use: the passwords below are in this file, and the certificates come from the gateway's own CA.

## Start it

You need Docker, Node 26 and `npm install` done. From the repository root:

```sh
npm run dev
```

It builds every app's web client, starts the containers with their logs streaming, sets VoidAuth up as a homelab admin would, and prints the addresses and accounts among the logs. Running it again keeps everything and only fills in what is missing. Ctrl+C stops the containers, keeping accounts and data.

Browsers send every name under `.localhost` to this machine, so there is no hosts file to edit.

The first time, also **trust the gateway's CA** (optional, but needed to install the apps and open them offline: browsers register no service worker on a site with a certificate warning). The script saves it as `tools/dev/data/gateway-root-ca.crt`. On macOS:

```sh
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain tools/dev/data/gateway-root-ca.crt
```

Then restart the browser. Firefox keeps its own list: Settings, Privacy & Security, Certificates, View Certificates, Authorities, Import. `npm run dev:reset` makes a new CA, which must be trusted again.

## Addresses and accounts

| Address |  |
| --- | --- |
| <https://home.homelab.localhost:8443/> | Home: the apps each account can use |
| <https://notes.homelab.localhost:8443/> | Notes |
| <https://encyclopedia.homelab.localhost:8443/> | The Encyclopedia |
| <https://accounts.homelab.localhost:8443/> | VoidAuth: signing in, your account, and the admin pages (`/admin`) |

| Username | Password | Gets |
| --- | --- | --- |
| `auth_admin` | `violet-quartz-harbour-71` | The homelab admin: every app, Notes as an owner, VoidAuth's admin pages |
| `ada` | `lantern-meadow-copper-48` | Notes as an owner, and the Encyclopedia |
| `dana` | `quartz-ember-willow-27` | Notes as a member, no Encyclopedia |
| `bob` | `harbour-violet-thistle-93` | A homelab account but no apps: Home only |

Opening an app sends you to VoidAuth's sign-in page, as on a real install. It never asks to add a passkey, since the App switcher skips that question; add one from **Account settings** in the switcher. To switch accounts, use **Sign out** in the switcher.

## Start over

```sh
npm run dev:reset   # deletes everything; the next `npm run dev` starts from empty
```

Set `GATEWAY_PORT` (default `8443`) or `HOMELAB_DOMAIN` (default `homelab.localhost`) to use another port or domain, the same on every run. The Home and Notes servers run from this checkout, so restarting one picks up server changes (`docker compose -f tools/dev/compose.yaml restart notes`), and `npm run dev` rebuilds the web clients and the gateway, with the App switcher in it.

## Files

- `compose.yaml`: the containers. Only the gateway publishes a port, since Home and Notes trust the `Remote-*` headers the gateway sets. Home reads apps' manifests from the gateway container, trusting the CA in its volume.
- `gateway.caddyfile`: one site per hostname; each app's site imports the sign-in check and the App switcher from [`packages/gateway`](../../packages/gateway/README.md), whose image `npm run dev` builds first (as `homelab-gateway`).
- `start.ts`: what `npm run dev` and `npm run dev:reset` run.
