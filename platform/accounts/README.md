# Accounts

The homelab's accounts service, at `accounts.<domain>`: where people sign in with their email and password, and which tells the gateway who is signed in and which apps they have App access to ([ADR-PLAT-004](../../docs/adr/ADR-PLAT-004-sign-in.md)). It is built on [Better Auth](https://www.better-auth.com), pinned to an exact version, with one SQLite file.

Part of the [platform](../../docs/adr/ADR-PLAT-002-repo-structure.md) in the [homelab monorepo](../../README.md), as the `accounts` project. Words such as **App access** and **Account id** are defined in the root [`GLOSSARY.md`](../../GLOSSARY.md).

## Routes

| Route |  |
| --- | --- |
| `GET /api/authz/forward-auth` | The gateway's sign-in check: 200 with `Remote-User` (the account id), `Remote-Name`, `Remote-Email` and `Remote-Groups`; a redirect to `/sign-in` with no session; the 403 no-access page without App access, or for a hostname that isn't an installed app |
| `GET /sign-in`, `POST /sign-in` | The sign-in page and its form. `return-to` must be under the parent domain, on `HOMELAB_URL`'s scheme and port, or the person lands on their account page |
| `GET /sign-out` | Ends this browser's session and shows the sign-in page |
| `GET /` | The signed-in person's account page |
| `GET /api/me` | Who is signed in and their apps, for the App switcher in every app and Home's tiles: `{ person: { id, name, email }, accountUrl, signOutUrl, apps: [{ id, url, name, icon, opensOffline }] }`, `person.id` being the account id. 401 `{ error: "signed_out" }` with no session |

## Who is signed in and their apps

`/api/me` answers from the session cookie. The accounts site is outside the gateway's sign-in check, so a signed-out browser gets a 401 that its page can read, rather than the gateway's redirect.

- A person's apps are Home and the installed apps they have App access to, sorted by name. Home is always one of them; while an app's manifest, Home's included, can't be read, it shows under its subdomain with no icon, and one warning names it.
- Each app's name, icon and whether it opens offline come from its `/manifest.webmanifest`, read through the gateway without anyone's cookie, which the gateway allows for manifests and icons. Manifests are kept for 5 minutes and shared by everyone's requests. An address with no manifest is asked again after a minute, and an app whose manifest stops answering stays as it was for up to a day, in case it is restarting.
- An installed app whose manifest can't be read is shown under its subdomain (`Vault` for `vault`), with no icon and not opening offline, and the service logs one warning naming it, repeated only once the manifest has been read again and lost again. The account page and the People page show apps the same way.
- Answers are readable cross-origin, with credentials, by any https page under the parent domain, and the accounts site's own pages ask without an `Origin`. A request the browser marks cross-site, or with any other `Origin`, gets 403. Apps ask with a plain `GET`, which needs no preflight.

## Settings

| Variable | Default |  |
| --- | --- | --- |
| `HOMELAB_URL` | required | The parent address every app is a subdomain of: https, with its port if any, such as `https://home.example` or `https://homelab.localhost:8443`. This service is at `accounts.` under it, and the session cookie on its domain |
| `ACCOUNTS_SECRET` | required | At least 32 random characters, which sign session cookies |
| `HOMELAB_APPS` | none | The installed apps' subdomains, such as `notes,encyclopedia`: the only apps App access can name. Home is always open |
| `DATA_DIR` | `data` | Where the SQLite file lives |
| `PORT` | `3000` |  |
| `GATEWAY_URL` | each app's own address | Where to reach the gateway to read manifests, when apps' names don't resolve to it where the service runs. Over `http:` the service sends `X-Forwarded-Proto: https`, as the proxy that ends TLS in front of such a gateway does |
| `GATEWAY_CA` | the system's CAs | A PEM file with the CA of the gateway's certificates, read when a manifest is fetched |
| `SIGN_IN_RATE_WINDOW`, `SIGN_IN_RATE_MAX` | `60`, `5` | Sign-in attempts allowed per address the gateway saw, in each window of this many seconds |

## Test people

[`src/test-people.ts`](src/test-people.ts) makes known people with published passwords and App access, for end-to-end tests, dev and previews. Next to a running service, with its environment:

```sh
echo '[{"email":"ada@example.com","password":"lantern-meadow-copper-48","name":"Ada Lovelace","apps":{"notes":"admin"}}]' \
  | node --no-experimental-webstorage platform/accounts/src/load-test-people.ts
```

It makes each person, or brings an existing one to exactly what is given, and prints each person's account id by email.

## Tests

```sh
npx nx test accounts  # requests to the service in this process, with no gateway or browser
```

The platform's end-to-end suite runs it behind the gateway.
