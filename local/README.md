# The homelab on your machine

One command starts everything that exists so far, for trying it by hand: the gateway (Caddy), VoidAuth, [Notes](../apps/notes/README.md) and the [Encyclopedia](../apps/encyclopedia/README.md), each on its own hostname under `home.test`, signed in as one of a few test people.

It is not an install for real use: the passwords below are in this file, and the certificates come from the gateway's own CA.

## Start it

You need Docker, Node 26 and `npm install` done. From the repository root:

```sh
npm run local
```

It builds both apps' web clients, starts the containers, sets VoidAuth up as a homelab admin would, and prints the addresses and accounts. Running it again keeps everything and only fills in what is missing.

The first time, also:

1. **Point the names at this machine.** Add this line to `/etc/hosts` (`sudo nano /etc/hosts`); the script prints it while it is missing:

   ```text
   127.0.0.1 auth.home.test notes.home.test encyclopedia.home.test
   ```

2. **Trust the gateway's CA** (optional, but needed to install the apps and open them offline: browsers register no service worker on a site with a certificate warning). The script saves it as `local/data/gateway-root-ca.crt`. On macOS:

   ```sh
   sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain local/data/gateway-root-ca.crt
   ```

   Then restart the browser. Firefox keeps its own list: Settings, Privacy & Security, Certificates, View Certificates, Authorities, Import. `npm run local -- reset` makes a new CA, which must be trusted again.

## Addresses and accounts

| Address |  |
| --- | --- |
| <https://notes.home.test:8443/> | Notes |
| <https://encyclopedia.home.test:8443/> | The Encyclopedia |
| <https://auth.home.test:8443/> | VoidAuth: signing in, your account, and the admin pages (`/admin`) |

| Username | Password | Gets |
| --- | --- | --- |
| `auth_admin` | `violet-quartz-harbour-71` | The homelab admin: every app, Notes as an owner, VoidAuth's admin pages |
| `ada` | `lantern-meadow-copper-48` | Notes as an owner, and the Encyclopedia |
| `dana` | `quartz-ember-willow-27` | Notes as a member, no Encyclopedia |
| `bob` | `harbour-violet-thistle-93` | A homelab account but no apps |

VoidAuth offers to set up a passkey after a password sign-in; **Skip** is fine.

## Stop and start over

```sh
npm run local -- stop    # stops the containers, keeping accounts and data
npm run local -- reset   # deletes everything; the next `npm run local` starts from empty
```

Set `GATEWAY_PORT` (default `8443`) or `HOMELAB_DOMAIN` (default `home.test`) to use another port or domain, the same on every run. The Notes server runs from this checkout, so restarting it picks up server changes (`docker compose -f local/compose.yaml restart notes`), and `npm run local` rebuilds the web clients.

## Files

- `compose.yaml`: the containers. Only the gateway publishes a port, since Notes trusts the `Remote-*` headers the gateway sets.
- `gateway.caddyfile`: one site per hostname; each app's site asks VoidAuth before passing a request on.
- `start.ts`: what `npm run local` runs.
