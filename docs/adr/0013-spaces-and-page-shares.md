# 13. Access is granted by sharing spaces and pages

- Status: Proposed
- Date: 2026-10-16
- Depends on: [ADR 1](0001-works-offline.md), [ADR 11](0011-local-password-accounts.md), [ADR 12](0012-hocuspocus-sync-server.md)
- Dependency of: [ADR 14](0014-google-docs-style-roles.md)

## Context
An instance serves a few trusted people, but not everything is for everyone: drafts and journals are personal, a gift list must stay hidden from the person it is for, and a contractor or babysitter needs a handful of pages and nothing else. Google Docs-style sharing per item is flexible, but recipients get a flat "Shared with me" list that loses where things belong. Notion-style spaces keep pages organised, but only share all or nothing. Each device holds a local copy of what its user can see ([ADR 1](0001-works-offline.md)), so access also decides what reaches each device.

## Decision
- **Every page belongs to exactly one space.** A space is a named, top-level group of pages (e.g. "Household", "Party for Sam"). Every account has a **Private** space that only its owner sees.
- **There is no automatic "everyone" space.** Inviting a person ([ADR 11](0011-local-password-accounts.md)) includes choosing which spaces they join. A person who joins none starts with only their Private space.
- **There are two ways to share:**
  - **Share a space.** The sharer picks people, then which pages they see. Every page starts ticked, and unticking a page also hides its subpages. The sharer also picks a rule for **new pages**: visible to them, hidden from them, or ask whoever creates the page. A new subpage always follows its parent.
  - **Share a page.** The page and its subpages are shared on their own. The recipient does not see the space or its name.
- **Being a member of a space is a space share with every page and new pages visible.** There is no separate membership concept.
- **The recipient's sidebar keeps context:**
  - A shared space appears under its own name, showing only the pages the recipient can see and how many that is ("3 of 6 pages").
  - Shared pages appear under "Pages shared with you", each marked with who shared it.
- **Pages a person cannot see never reach their devices.** That includes titles, contents and search results. A link to such a page shows "Page you don't have access to", without its title.
- Members see which pages are hidden from whom (e.g. a crossed-out eye on a page hidden from Sam).
- **Moving a page that changes who can see it asks first**, naming the people affected ("Share Gift ideas with Alex and Jo?").
- **Removing access takes effect on the device's next sync.** The server tells the device which pages it has lost, and the app deletes its local copies. Edits made offline after access was removed are not saved; the app says so and offers to keep a private copy.
- Every share carries a role ([ADR 14](0014-google-docs-style-roles.md)).

## Evidence
- None yet from a spike. Feasibility under per-person sync is not assessed.
- UX mockups and the reasoning behind each step are in `docs/design/access/` (rows 1–6). Row 6 is the model this ADR describes.

## Consequences
- When accepted, this ADR supersedes parts of [ADR 1](0001-works-offline.md):
  - "Each device keeps the whole workspace" becomes "each device keeps everything its user can see".
  - "Data that has reached a device stays on it" becomes "until the next sync after access is removed".
- How data is split across Yjs documents (see "Not decided yet" in the [index](README.md)) must allow a different page tree for each person. With the prototype's single tree document, every title would reach every device.
- The sync server must check access for each document, not only the session on each connection ([ADR 12](0012-hocuspocus-sync-server.md)).
- Public read-only publishing of pages and subpages is still to be decided, and builds on this model.
- What "Private" protects against must be worded honestly: the server administrator can read everything, because there is no end-to-end encryption.
