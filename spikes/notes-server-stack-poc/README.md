# Notes: server stack (proof of concept)

A server-only spike for the [Notes app](../../apps/notes/README.md). It checks whether **Hono**, **Hocuspocus** and **Better Auth** work together as the Notes server, as proposed in [`research/08-framework-options.md`](../../apps/notes/docs/research/08-framework-options.md). The findings are in [`research/09-server-stack-spike-findings.md`](../../apps/notes/docs/research/09-server-stack-spike-findings.md).

> Status: **frozen** once its findings are recorded ([ADR 16](../../docs/adr/0016-spike-placement.md)). It is left out of the repo-wide scripts; run it by name, as below.

## What it shows
1. **Hono serves the PWA and the API**: health, first-run setup, Better Auth's routes, static files with a fallback for client-side routes.
2. **Hocuspocus runs behind Hono** through `handleConnection`, with no server of its own, carrying many documents over one socket and storing them in SQLite.
3. **A Better Auth session cookie authenticates the sync socket.** A missing, forged or expired session is refused with 401 before the upgrade. Access is then decided per document, including read-only documents.
4. **Sessions are long-lived** (a year, extended on use), and **revoking a session closes that device's open socket** right away and stops it reconnecting.

The access rules are stand-ins for [ADR 13](../../apps/notes/docs/adr/0013-access-model.md): `private/<userId>/…` documents are only for their owner, and `readonly/…` documents are read-only for everyone but admins.

## Layout
- `server/src/app.ts`: the Hono app, the `/sync` upgrade route and the Hocuspocus instance
- `server/src/auth.ts`: the Better Auth configuration
- `server/src/store.ts`: Yjs document storage, in the same SQLite file as the accounts
- `server/test/`: Vitest tests that start real servers and connect real Hocuspocus providers

## Run it
From the repo root:

```sh
npm install
npx nx test notes-server-stack-poc-server
BETTER_AUTH_SECRET=$(openssl rand -hex 32) npx nx start notes-server-stack-poc-server   # http://localhost:3000
```

Then create the admin and sign in:

```sh
curl -X POST localhost:3000/api/setup -H 'content-type: application/json' -d '{"username":"admin","password":"a long password"}'
curl -i -X POST localhost:3000/api/auth/sign-in/username -H 'content-type: application/json' -d '{"username":"admin","password":"a long password"}'
```
