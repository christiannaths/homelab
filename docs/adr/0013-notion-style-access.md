# 13. Access follows Notion's model of teamspaces and page sharing

- Status: Proposed
- Date: 2026-10-16
- Depends on: [ADR 1](0001-works-offline.md), [ADR 11](0011-local-password-accounts.md), [ADR 12](0012-hocuspocus-sync-server.md)
- Dependency of: [ADR 14](0014-notion-page-access-levels.md)

## Context
An instance serves a few trusted people, but not everything is for everyone: drafts and journals are personal, and outsiders such as a contractor or babysitter need a handful of pages and nothing else. Several custom models were explored (partial shares of spaces, rules for new pages, a single sharing tree). Their extra flexibility did not justify the cost of a model users would have to learn. Notion's model is familiar to the intended users, and covers these cases. Each device holds a local copy of what its user can open ([ADR 1](0001-works-offline.md)), so access also decides what reaches each device.

## Decision
- **Access copies Notion's model**, as described in the [access specs](../specs/access/README.md):
  - **Workspace roles:** workspace owner, member and guest. One instance is one workspace.
  - **Teamspaces:** open, closed or private, optionally default, each with owners, members and default access levels.
  - **Private and Shared sidebar sections.**
  - **Page sharing:** a Share menu with access levels ([ADR 14](0014-notion-page-access-levels.md)) and general access. Subpages inherit, any page can expand or restrict what it inherits, and the most permissive level wins.
- **Features tied to Notion's paid plans are always available.** Enterprise-only roles, groups and per-row database rules are left out.
- **A person's devices only receive the pages that person can open.** That includes titles, contents and search results.
- **Access changes take effect at the device's next sync.** When access is lost, the device deletes its local copies. Unsynced edits to those pages are not saved; the app says so and offers to keep a private copy.

## Evidence
- None yet from a spike. Feasibility under per-person sync is not assessed.
- The model follows Notion's help centre ("Sharing & permissions", "Intro to teamspaces", "Who's who in a workspace"). Details still to be checked are marked in the specs.

## Consequences
- When accepted, this ADR supersedes parts of [ADR 1](0001-works-offline.md):
  - "Each device keeps the whole workspace" becomes "each device keeps everything its user can open".
  - "Data that has reached a device stays on it" becomes "until the next sync after access is lost".
- How data is split across Yjs documents (see "Not decided yet" in the [index](README.md)) must allow a different page tree for each person. With the prototype's single tree document, every title would reach every device.
- The sync server must check access for each document, not only the session on each connection ([ADR 12](0012-hocuspocus-sync-server.md)).
- Public read-only publishing of pages and subpages is still to be decided.
- What "Private" protects against must be worded honestly: the server administrator can read everything, because there is no end-to-end encryption.
