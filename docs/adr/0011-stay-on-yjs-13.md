# 11. Stay on Yjs 13 until the stack supports Yjs 14

- Status: Accepted
- Date: 2026-10-16

## Context
Yjs 14 is in release candidates. BlockNote already ships entry points for both (`@blocknote/core/yjs` for 13, `@blocknote/core/y` for 14), but Hocuspocus and `y-indexeddb` are still on 13. Mixing major versions would split the shared types between two runtimes.

## Decision
- Use **Yjs 13** across client, server and tests.
- Revisit only when **every** Yjs-dependent part we use (sync server, device storage, editor binding) supports 14. That revisit is a planned migration with its own ADR, tested against real stored data, never a casual dependency bump.
- The revisit is tracked by a standing issue, [#4](https://github.com/christiannaths/localnotion/issues/4). It lists the gate and the migration steps, and goes back into the development queue periodically so the upgrade is re-attempted.

## Consequences
- Yjs dependency upgrades stay within 13.x.
- New code keeps Yjs use behind our own model and sync modules (ADR 10), which keeps a future migration contained.
