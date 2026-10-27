# Accounts

The accounts service at `accounts.<domain>`: email-and-password sign-in, and the gateway's answer to who's signed in and their App access ([ADR-PLAT-004](../../docs/adr/ADR-PLAT-004-sign-in.md)). [Better Auth](https://www.better-auth.com), exact-pinned, one SQLite file. Terms: [`GLOSSARY.md`](../../GLOSSARY.md).

## Routes

| Route |  |
| --- | --- |
| `GET /api/authz/forward-auth` | Gateway's sign-in check: 200 + `Remote-User` (account id), `Remote-Name`, `Remote-Email`, `Remote-Groups`; no session → redirect to `/sign-in`; no App access or not an installed app → 403 no-access page |
| `GET /sign-in`, `POST /sign-in` | Sign-in page and form. `return-to` must be under the parent domain on `HOMELAB_URL`'s scheme and port, else the account page |
| `POST /sign-out` | Ends this browser's session only; from a homelab page (else 403). A form gets a redirect to `/sign-in`; the App switcher's fetch gets an answer it reads. `GET` → 405, so a link or image can't sign anyone out |
| `POST /session` | Sent by the App switcher on each load: extends the session and refreshes its cookie, which the gateway's check can't |
| `GET /` | Account page |
| `GET /api/me` | For the App switcher and Home: `{ person: { id, name, email }, accountUrl, signOutUrl, apps: [{ id, url, name, icon, opensOffline }] }` (`person.id` = account id). No session → 401 `{ error: "signed_out" }` |

## `/api/me`

- From the session cookie. Outside the gateway's check, so signed out gets a readable 401, not a redirect.
- Apps: Home (always) plus installed apps with App access, by name.
- Name, icon and opens-offline come from each `/manifest.webmanifest`, fetched through the gateway with no cookie:

  | Manifest | Behaviour |
  | --- | --- |
  | Read | Cached 5 min, shared across requests |
  | Missing | Retried after 1 min |
  | Stops answering | Last copy kept up to a day (app may be restarting) |
  | Unreadable (Home too) | Subdomain as name (`Vault`), no icon, not offline; one warning, repeated only after a read-then-loss |

  Account and People pages show apps the same way.

- CORS: credentialed reads from any https page under the parent domain; own pages send no `Origin`. Cross-site or other `Origin` → 403. Plain `GET`, no preflight.

## Settings

| Variable | Default |  |
| --- | --- | --- |
| `HOMELAB_URL` | required | Parent https address, port if any (`https://home.example`, `https://homelab.localhost:8443`). Service at `accounts.` under it; cookie on its domain |
| `ACCOUNTS_SECRET` | required | ≥32 random characters; signs session cookies |
| `HOMELAB_APPS` | none | Installed apps' subdomains (`notes,encyclopedia`), the only apps App access can name. Home is always open |
| `DATA_DIR` | `data` | SQLite file location |
| `PORT` | `3000` |  |
| `GATEWAY_URL` | each app's own address | Gateway for manifest reads when app names don't resolve to it here. Over `http:` sends `X-Forwarded-Proto: https`, as a TLS-ending proxy would |
| `GATEWAY_CA` | system CAs | PEM with the gateway certificates' CA, read per manifest fetch |
| `SIGN_IN_RATE_WINDOW`, `SIGN_IN_RATE_MAX` | `60`, `5` | Sign-in attempts per gateway-seen address per window (seconds) |

## Test people

[`src/test-people.ts`](src/test-people.ts) makes known people with published passwords and App access (e2e, dev, previews). With a running service's environment:

```sh
echo '[{"email":"ada@example.com","password":"lantern-meadow-copper-48","name":"Ada Lovelace","apps":{"notes":"admin"}}]' \
  | node --no-experimental-webstorage platform/accounts/src/load-test-people.ts
```

Creates each person or resets an existing one to exactly this; prints account ids by email.

## Tests

```sh
npx nx test accounts  # requests to the service in this process, with no gateway or browser
```

`platform-e2e` runs it behind the gateway.
