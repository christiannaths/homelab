# 14. Every share carries a Google Docs-style role

- Status: Proposed
- Date: 2026-10-16
- Depends on: [ADR 12](0012-hocuspocus-sync-server.md), [ADR 13](0013-spaces-and-page-shares.md)
- Dependency of: none

## Context
Sharing ([ADR 13](0013-spaces-and-page-shares.md)) decides what a person can see. Some people should only read what they see: a babysitter's house manual, an accountant's yearly summary. Google Docs roles are familiar to most users, so copying them avoids teaching a new permission model.

## Decision
- **Every share grants one role:**
  - **Viewer:** can read.
  - **Commenter:** can read and comment.
  - **Editor:** can read, comment and edit.

  The default when sharing is Editor, as in Google Docs.
- **Each space has one Owner**, by default its creator, who has every Editor permission. Only the Owner can delete the space or transfer ownership. A page share has no separate owner; it follows its space.
- **Editors can share and change other people's roles, unless the Owner turns that off**, as with Google Docs' "Editors can change permissions and share" setting. Viewers and Commenters cannot share.
- **A person who has access through more than one share gets the most permissive role.** For example, a Viewer of a space who is also given a page as Editor can edit that page.
- **The UI does not offer editing to Viewers and Commenters, and the server rejects their edits when they sync.**
- Until comments exist, Commenter behaves like Viewer.

## Evidence
- None yet from a spike. The roles mirror Google Docs' sharing model.

## Consequences
- The sync server must check, for each document, whether a connection may write, and reject updates otherwise ([ADR 12](0012-hocuspocus-sync-server.md)).
- Read-only copies on devices still work offline. Only editing is unavailable to Viewers and Commenters.
- Comments are a prerequisite for the Commenter role to mean anything (see "Not decided yet" in the [index](README.md)).
- Time-limited access (e.g. a babysitter until a set date) is not covered, and would extend this ADR.
