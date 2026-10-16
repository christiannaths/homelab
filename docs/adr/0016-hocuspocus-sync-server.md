# 16. Keep Hocuspocus as the sync server

- Status: Accepted
- Date: 2026-10-16

## Context
- **Hocuspocus** relays Yjs updates between devices and the server's storage. It authenticates **each document** a connection opens.
- With whole-workspace sync (ADR 2), its anti-abuse defaults (at most 100 documents waiting for authentication on one connection) disconnected large workspaces in a loop (PR #1).
- The alternative was a small custom sync server on the standard Yjs protocol.

## Decision
- **Keep Hocuspocus 4.**
- Raise its per-connection pending-document and queue limits. They're anti-abuse settings for public servers, and the sync endpoint is private and authenticated (ADRs 13, 14).
- Authenticate **once per connection**: check the session and workspace membership on the first document, then reuse the result for that connection's other documents.
- The opt-in large-workspace test (`SLOW=1`, `tests/sync-scale.spec.ts`) is the regression gate for this decision.

## Evidence
2,000 pages (2,001 docs), headless Chromium, localhost, `tests/sync-scale.spec.ts`:

| Scenario | Time |
|---|---|
| New device downloads every doc | 9.4 s |
| Reconnect until every doc has re-synced (3 runs) | 1.7–2.0 s |
| Server restart until both devices have re-synced | 7.5 s |
| Warm reload until every doc has re-synced | 3.9 s |

No connections were dropped. The test also caught and fixed a bug: the sync badge reported "Synced" right after reconnecting, before anything had been exchanged.

## Consequences
- Clients and storage use plain Yjs and don't depend on Hocuspocus's data format. Replacing it later means rewriting the server's sync layer and one client component, with **no data migration**.
- Revisit it (with a new ADR) if the gate test fails at the sizes we support, if per-document overhead dominates startup on real devices, or if Hocuspocus blocks a needed feature such as batched sync.
