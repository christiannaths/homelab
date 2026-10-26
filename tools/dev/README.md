# The homelab on your machine

One command starts everything that exists so far, for trying it by hand: the gateway (the homelab's Caddy build), the [accounts service](../../platform/accounts), [Home](../../platform/home/README.md), [Notes](../../apps/notes/README.md) and the [Encyclopedia](../../apps/encyclopedia/README.md), each on its own hostname under `homelab.localhost`, signed in as one of a few test people.

It is not an install for real use: the passwords below are in this file, and the certificates come from the gateway's own CA.

## Start it

You need Docker, Node 26 and `npm install` done. From the repository root:

```sh
npm run dev
```

It builds every app's web client, starts the containers with their logs streaming, makes the test people in the accounts service, and prints the addresses, the test people and a one-click sign-in link for each among the logs. Running it again keeps everything and only adds the test people who are missing. Ctrl+C stops the containers, keeping accounts and data.

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
| <https://accounts.homelab.localhost:8443/> | The accounts service: signing in, and your account page |

| Email | Password | Gets |
| --- | --- | --- |
| `admin@example.com` | `violet-quartz-harbour-71` | The homelab admin: Notes as an owner, and the Encyclopedia |
| `ada@example.com` | `lantern-meadow-copper-48` | Notes as an owner, and the Encyclopedia |
| `dana@example.com` | `quartz-ember-willow-27` | Notes as a member, no Encyclopedia |
| `bob@example.com` | `harbour-violet-thistle-93` | A homelab account but no apps: Home only |

Opening an app sends you to the accounts service's sign-in page, as on a real install. The people are in [`tools/test-people.ts`](../test-people.ts), shared with previews.

To switch people quickly, open the person's **one-click sign-in link** that `npm run dev` prints, such as <https://accounts.homelab.localhost:8443/test-sign-in?email=ada%40example.com>: it signs the browser in as them with no password and opens Home. Only dev has these links: the accounts service answers them only with `TEST_SIGN_IN_LINKS=on`, which `compose.yaml` sets, and refuses that setting in production. To sign out, use **Sign out** in the switcher.

## Start over

```sh
npm run dev:reset   # deletes everything; the next `npm run dev` starts from empty
```

Set `HOMELAB_URL` (default `https://homelab.localhost:8443`) to use another domain or port, the same on every run: the platform gets it as it is, and the gateway its hostname and port. The accounts service and the Home and Notes servers run from this checkout, so restarting one picks up server changes (`docker compose -f tools/dev/compose.yaml restart notes`), and `npm run dev` rebuilds the web clients and the gateway, with the App switcher in it.

## Files

- `compose.yaml`: the containers. Only the gateway publishes a port, since the apps trust the `Remote-*` headers the gateway sets. The accounts service, Home and Notes run from this checkout. The accounts service reads apps' manifests from the gateway container, trusting the CA in its volume.
- `.env`: the accounts service's `ACCOUNTS_SECRET`, which signs its session cookies, made by `start.ts` on first run and deleted by `npm run dev:reset`, and the last run's `HOMELAB_URL` with the hostname and port the gateway gets from it, so `docker compose` commands run by hand get the same.
- `gateway.caddyfile`: one site per hostname; each app's site imports the sign-in check and the App switcher from [`platform/gateway`](../../platform/gateway/README.md), whose image `npm run dev` builds first (as `homelab-gateway`).
- `start.ts`: what `npm run dev` and `npm run dev:reset` run.
