# 14. Page access levels mirror Notion's

- Status: Proposed
- Date: 2026-10-16
- Depends on: [ADR 12](0012-hocuspocus-sync-server.md), [ADR 13](0013-notion-style-access.md)
- Dependency of: none

## Context
The access model ([ADR 13](0013-notion-style-access.md)) decides who can open a page. Some people should only read or comment on what they can open: a babysitter's house manual, an accountant's yearly summary. Notion's access levels are familiar to the intended users, so copying them avoids teaching a new permission model.

## Decision
- **Every grant of access carries one of Notion's levels:**
  - **Full access:** read, comment, edit, and share.
  - **Can edit:** read, comment and edit, but not share.
  - **Can edit content** (databases only): edit rows and their values, but not the database's properties, views, sorts or filters.
  - **Can comment:** read and comment.
  - **Can view:** read.
  - **No access:** used to restrict an inherited level.
- **Only Full access can share** or change other people's access.
- **The most permissive level wins** when a person has access from more than one source.
- **The UI does not offer actions a level does not allow, and the server rejects edits from people below Can edit when their device syncs.**
- Until comments exist, Can comment behaves like Can view.

## Evidence
- None yet from a spike. The levels follow Notion's help centre ("Sharing & permissions").

## Consequences
- The sync server must check, for each document, whether a connection may write, and reject updates otherwise ([ADR 12](0012-hocuspocus-sync-server.md)).
- Can edit content means checking which parts of a database document an update changes, not only whether it is allowed to write.
- Read-only copies still work offline. Only editing is unavailable.
- Comments are a prerequisite for Can comment to mean anything (see "Not decided yet" in the [index](README.md)).
