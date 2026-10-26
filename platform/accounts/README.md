# Accounts

The homelab's accounts service, at `accounts.<domain>`: where people sign in with their email and password, and which tells the gateway who is signed in and which apps they have App access to ([ADR-PLAT-004](../../docs/adr/ADR-PLAT-004-sign-in.md)). It is built on [Better Auth](https://www.better-auth.com), pinned to an exact version, with one SQLite file.

Part of the [platform](../../docs/adr/ADR-PLAT-002-repo-structure.md) in the [homelab monorepo](../../README.md), as the `accounts` project. Words such as **App access** and **Account id** are defined in the root [`GLOSSARY.md`](../../GLOSSARY.md).

## Routes

| Route |  |
| --- | --- |
| `GET /api/authz/forward-auth` | The gateway's sign-in check: 200 with `Remote-User` (the account id), `Remote-Name`, `Remote-Email` and `Remote-Groups`; a redirect to `/sign-in` with no session; the 403 no-access page without App access, or for a hostname that isn't an installed app |
| `GET /sign-in`, `POST /sign-in` | The sign-in page and its form. `return-to` must be https under the parent domain, or the person lands on their account page |
| `GET /sign-out` | Ends this browser's session and shows the sign-in page |
| `GET /` | The signed-in person's account page |

## Settings

| Variable | Default |  |
| --- | --- | --- |
| `HOMELAB_DOMAIN` | required | The parent domain every app is under, such as `home.example` |
| `ACCOUNTS_SECRET` | required | At least 32 random characters, which sign session cookies |
| `HOMELAB_APPS` | none | The installed apps' subdomains, such as `notes,encyclopedia`: the only apps App access can name. Home is always open |
| `ACCOUNTS_URL` | `https://accounts.<HOMELAB_DOMAIN>` | This service's address through the gateway, with its port if any |
| `DATA_DIR` | `data` | Where the SQLite file lives |
| `PORT` | `3000` |  |
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

The platform's and Notes' end-to-end suites run it behind the gateway.
