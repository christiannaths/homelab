# 10. Yjs stays on version 13 until the whole stack supports 14

- Status: Accepted
- Date: 2026-10-16
- Depends on: [ADR 2](0002-yjs-stores-shared-data.md), [ADR 8](0008-blocknote-and-mantine.md), [ADR 9](0009-pure-model-and-tests.md), [ADR 12](0012-hocuspocus-sync-server.md)
- Dependency of: none

## Context
Yjs 14 is in release candidates. BlockNote ([ADR 8](0008-blocknote-and-mantine.md)) already ships entry points for both versions (`@blocknote/core/yjs` for 13, `@blocknote/core/y` for 14), but Hocuspocus ([ADR 12](0012-hocuspocus-sync-server.md)) and `y-indexeddb` are still on 13. Mixing major versions would split the shared types between two runtimes.

## Decision
- **Yjs 13** is used across the client, the server and the tests.
- The upgrade is revisited only when **every** Yjs-dependent part in use (sync server, device storage, editor binding) supports 14. The upgrade is then a planned migration with its own ADR, tested against real stored data, never a casual dependency bump.
- A standing issue, [#4](https://github.com/christiannaths/localnotion/issues/4), tracks the revisit. It lists the gate and the migration steps, and goes back into the development queue periodically so the upgrade is re-attempted.

## Evidence
- The installed packages declare Yjs 13 only: `@hocuspocus/server` and `@hocuspocus/provider` 4.7.1 (`yjs ^13.6.8`), and `y-indexeddb` 9.0.12 (`yjs ^13.0.0`).

## Consequences
- Yjs dependency upgrades stay within 13.x.
- New code keeps Yjs use behind the model and sync modules ([ADR 9](0009-pure-model-and-tests.md)), so the eventual migration stays contained.
