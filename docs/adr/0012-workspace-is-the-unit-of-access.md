# 12. The workspace is the unit of access

- Status: Accepted
- Date: 2026-10-16

## Context
Every device keeps the whole workspace (ADR 1). If access were per page, each device would need a filtered subset of the workspace, and the server would have to filter the page tree per user. Hiding a page then becomes a sync problem as well as a UI problem, and revoked or partial access gets hard to reason about offline.

## Decision
- **Access is granted per workspace.** A member of a workspace can see everything in it, and nothing in another workspace unless they're a member there too.
- A person can belong to several workspaces. Content meant for only some people goes in its own workspace (e.g. a personal one and a shared household one).
- The server checks workspace membership when a device syncs (ADR 15). A device only ever receives docs from workspaces its user belongs to.
- Sharing with people who aren't members is done only by publishing (ADR 14), which is read-only and separate from sync.

## Consequences
- No per-page permissions inside a workspace.
- Removing someone from a workspace stops their syncing from that point on. Data already on their devices stays there. That's inherent to offline-first and acceptable for a few trusted users (ADR 4).
- Whether members can have different roles (e.g. read-only members) is not decided yet.
