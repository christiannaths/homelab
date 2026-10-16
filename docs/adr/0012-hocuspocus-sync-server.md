# 12. Hocuspocus is the sync server

- Status: Accepted
- Date: 2026-10-16
- Depends on: [ADR 1](0001-works-offline.md), [ADR 2](0002-yjs-stores-shared-data.md), [ADR 6](0006-sqlite-server-storage.md), [ADR 11](0011-local-password-accounts.md)
- Dependency of: [ADR 10](0010-yjs-13-until-stack-supports-14.md), [ADR 13](0013-notion-style-access.md), [ADR 14](0014-notion-page-access-levels.md)

## Context
Hocuspocus relays Yjs updates ([ADR 2](0002-yjs-stores-shared-data.md)) between devices and the server's storage ([ADR 6](0006-sqlite-server-storage.md)), and authenticates each document a connection opens. With whole-workspace sync ([ADR 1](0001-works-offline.md)), its anti-abuse defaults (at most 100 documents waiting for authentication on one connection) disconnected large workspaces in a loop during PR #1. The alternative was a small custom sync server on the standard Yjs protocol.

## Decision
- **Hocuspocus 4** stays the sync server.
- Its per-connection pending-document and queue limits are raised. They are anti-abuse settings for public servers, and the sync endpoint is private and authenticated ([ADR 11](0011-local-password-accounts.md)).
- **Authentication runs once per connection:** the session is checked on the first document, and the result is reused for that connection's other documents.
- The opt-in large-workspace test (`SLOW=1`, `tests/sync-scale.spec.ts`) is the regression gate for this decision.

## Evidence
- `tests/sync-scale.spec.ts` with 2,000 pages (2,001 docs), headless Chromium, localhost:

  | Scenario | Time |
  |---|---|
  | New device downloads every doc | 9.4 s |
  | Reconnect until every doc has re-synced (3 runs) | 1.7–2.0 s |
  | Server restart until both devices have re-synced | 7.5 s |
  | Warm reload until every doc has re-synced | 3.9 s |

- No connections were dropped.
- The test also caught a bug, since fixed: the sync badge reported "Synced" right after reconnecting, before anything had been exchanged.

## Consequences
- Clients and storage use plain Yjs and do not depend on Hocuspocus's data format. Replacing Hocuspocus means rewriting the server's sync layer and one client component, with **no data migration**.
- This decision is revisited, in a new ADR, if the gate test fails at supported sizes, if per-document overhead dominates startup on real devices, or if Hocuspocus blocks a needed feature such as batched sync.
- Hocuspocus's supported Yjs version constrains Yjs upgrades ([ADR 10](0010-yjs-13-until-stack-supports-14.md)).
