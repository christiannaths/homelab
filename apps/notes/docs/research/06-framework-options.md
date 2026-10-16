# Framework options for Notes

Date: 2026-10-16.

Measured against the first spike ([`spikes/notes-block-editing-collaboration-poc/`](../../../../spikes/notes-block-editing-collaboration-poc/README.md), about 2,200 lines) and what is planned (the [ADRs](../adr/README.md), the [access specs](../specs/access/README.md), and the MVP list in [`03-architecture.md`](03-architecture.md)).

## Verdict

**Skip a full-stack framework.** Next.js, React Router in framework mode, TanStack Start and similar tools would add little here and would get in the way. **Add three focused libraries** where the planned work is heavy and easy to get wrong:

| Pick | Replaces | Value | Why |
|---|---|---|---|
| **Better Auth** | Hand-written accounts and sessions (ADR 11) | High | Security code you would otherwise write yourself, and its defaults already match ADR 11 |
| **Hono** (on `@hono/node-server`) | Using Hocuspocus's `onRequest` with `throw null`, plus the hand-written static server | Medium to high | The server is about to gain a real HTTP API: sign-in, setup, invites, people, sharing, teamspaces, attachments |
| **TanStack Router** (client only, hash history) | Regex hash routes in `App.tsx` | Medium | Many more screens are coming, and database view state (filters, sorts) belongs in the URL |
| Drizzle (optional) | Raw `node:sqlite` for access tables | Low to medium | Only worth it once the access tables (teamspaces, grants, memberships) exist |

Keep Hocuspocus (ADR 12). It is already the sync framework, and its hooks are where the access work (ADR 13) has to happen.

## Why a full-stack framework adds little

What these frameworks offer is server rendering, server data loaders and actions, and deploy adapters. None of that fits:

- Every read and write goes to the local Yjs copy (ADR 1). A loader that fetches from the server would never run offline.
- The server cannot query Yjs data (ADR 2), so there is no server data for loaders to fetch.
- The service worker precaches the app shell (ADR 3). Server-rendered HTML works against that, and it would be a second code path.
- One Node process serves everything (ADR 4), and that process belongs to Hocuspocus.
- The client glue a framework would replace is small: `SyncManager.ts` plus `context.tsx` come to about 240 lines.
- Risk to the toolchain: the repo is on TypeScript 7 and avoids Nx plugins (ADR 15). Frameworks that rely on compiler plugins and code generation are more likely to break against that than small libraries are. ADR 15 already ran into this with typescript-eslint.

Svelte, Vue and Solid frameworks are ruled out by ADR 8, which requires React for BlockNote and Mantine.

## Local-first data frameworks (Jazz, Zero, LiveStore, ElectricSQL, Instant)

These are the only frameworks aimed at the hardest planned problem: syncing to each person only the data they can open (ADR 13). Jazz in particular has group-based read, write and admin permissions built in. They still lose here:

- Each one replaces Yjs as the source of truth (ADR 2), and with it the server storage (ADR 6) and Hocuspocus (ADR 12).
- BlockNote binds to Yjs (ADR 8), so the editor would need a new binding.
- Jazz encrypts data end to end, while ADR 4 wants a trusted server that can read content for search and backups. I took this from what I already knew and did not re-check it today.

Look at them again only if the ADR 13 feasibility design shows that per-person sync cannot be done on Yjs and Hocuspocus.

## The picks in detail

### Better Auth (ADR 11)

- **What it gives you:**
  - Hashes passwords with scrypt by default, which is what ADR 11 already chose.
  - Built-in rate limiting, with stricter limits on sign-in. ADR 11 lists rate limiting as required.
  - Session revocation.
  - A username plugin for username sign-in.
  - An admin plugin for creating users and resetting passwords.
- **Fits the stack:**
  - Accepts Node's built-in `node:sqlite` `DatabaseSync` directly, so ADR 5 and ADR 6 still hold.
  - Its CLI creates the tables.
- **WebSocket sign-in:** the sync socket is on the same origin, so the session cookie arrives with the upgrade request. `onAuthenticate` (or the Hono upgrade route) calls `auth.api.getSession({ headers })`.
- **Watch out for:**
  - Sessions expire after 7 days by default. A long-lived offline session (ADR 11) needs `expiresIn` and the renewal settings tuned.
  - It does not model Notion-style page access. Its organization and teams plugins are not page inheritance, so ADR 13 stays custom code.

### Hono (server HTTP)

- **Hocuspocus side:** Hocuspocus 4 can run without its own server. You call `handleConnection()` from your own upgrade handler, and its `onRequest`, `onUpgrade` and `onListen` hooks then stop firing. That is fine, because those are exactly the hooks Hono takes over.
- **What it gives you:** routing, middleware, cookies, validation, static file serving, and a typed RPC client for the few admin and sharing calls, so tRPC is not needed. Better Auth mounts as one route.
- **Watch out for:** Tiptap's Hono example uses `@hono/node-ws`, which Hono now marks as deprecated. Use the built-in WebSocket support in `@hono/node-server` (`websocket` option, `ws` `WebSocketServer` with `noServer: true`).
- **Alternative:** Fastify works just as well. Hono is smaller and uses the web-standard `Request`, which Better Auth's handler takes directly.

### TanStack Router

- **Planned screens:**
  - page and row pages
  - trash and diagnostics
  - settings and people
  - browse teamspaces
  - search
  - breadcrumbs that skip hidden parents
  - shareable database views with filters and sorts in the URL
- **What it gives you:** type-safe path and search params, and nested layouts (a sidebar shell around the content). It runs purely on the client with hash history, so the PWA's navigation fallback stays as it is. Its loaders are not needed and stay unused.
- **Alternative:** React Router in declarative mode, with the same trade-offs but weaker typing of search params.

## What does not need a library

- **State management** (Redux, Zustand, TanStack Query): Yjs plus `useSyncExternalStore` already acts as the store. TanStack Query would only help for a handful of admin requests.
- **Forms:** `@mantine/form` already comes with Mantine (ADR 8).

## The hard part no framework solves

Per-person sync (ADR 13 and ADR 14) is custom work whatever you pick:

- **Document split:** the page tree has to be split across Yjs documents so that each person receives only the titles they can see.
- **Per-document checks:** ADR 12 currently checks the session once per connection, but ADR 13 needs an access check for every document. One of the two has to be revised.
- **Read-only access:** Can view and Can comment map onto Hocuspocus's read-only connection flag (`readOnly` in the installed v4 types, set in `onAuthenticate`).
- **Can edit content:** this needs `beforeHandleMessage` to inspect which part of the database document an update changes.

## Next step

The server picks were tested in [`spikes/notes-server-stack-poc/`](../../../../spikes/notes-server-stack-poc/README.md). See [`07-server-stack-spike-findings.md`](07-server-stack-spike-findings.md).

## Sources

- Better Auth, SQLite adapter with `node:sqlite`: https://better-auth.com/docs/adapters/sqlite
- Better Auth, security (scrypt default, rate limiting, sessions): https://better-auth.com/docs/reference/security
- Better Auth, username plugin: https://better-auth.com/docs/plugins/username
- Hocuspocus, server examples (Hono, `handleConnection`): https://tiptap.dev/docs/hocuspocus/server/examples
- Hocuspocus, authentication and read-only: https://tiptap.dev/docs/hocuspocus/guides/authentication
- Hono, WebSocket helper (`@hono/node-ws` deprecated): https://hono.dev/helpers/websocket
- Drizzle, Node SQLite driver: https://orm.drizzle.team/docs/connect-node-sqlite
- Installed `@hocuspocus/server` v4 type definitions (`readOnly`, `beforeHandleMessage`)
