# Access and sharing: UX mockups

Ideation only. These mockups explore how access control could feel to a user. They don't assess feasibility, and nothing here is decided. Access control is still a "Not decided yet" row in [the ADR index](../../adr/README.md).

The live canvas is at https://claude.ai/artifact/UnXmJmHsjuYsu2cUNJGdHo (private to its owner). The `.dc.html` files here are its source. They render inside that canvas, not as standalone pages.

## The running example

A household instance has Chris, Alex, Jo and Sam, plus Dana, a contractor with a guest account. Chris plans a party for Sam:
- Sam should help with the **Guest list**.
- **Gift ideas** must stay a surprise.

## Model 1: Spaces plus per-page sharing (Notion-like)

| Screen | File | Shows |
|---|---|---|
| 1a | `Main.dc.html` | The sidebar is split into spaces: Shared (everyone), Party for Sam, Kitchen remodel and Private. Each space has its own members. |
| 1b | `SpaceCreate.dc.html` | Creating a space is a name plus a checklist of members. |
| 2a | `ShareDialog.dc.html` | Sharing one page (Guest list) with someone outside its space (Sam). The page stays where it is, with a "+Sam" badge. |
| 2b | `SamView.dc.html` | Sam's view: the page appears under "Shared with me". The space and its other pages don't exist for Sam. |
| 3a | `MoveConfirm.dc.html` | Moving a page into a space asks first: "Share Gift ideas with 2 people?" |
| 3b | `LinkWarning.dc.html` | Linking to a page a reader can't see. The reader sees "Page you don't have access to", with no title, and search never leaks titles. |
| 3c | `RemoveMember.dc.html` | Removing someone says what can't be taken back: copies already on their devices stay. |

## Model 2: Slack-like spaces you join

Spaces work like channels: you join and leave them. Each has an activity feed. "Direct" spaces hold pages between specific people.

| Screen | File | Shows |
|---|---|---|
| 4a | `SlackSidebar.dc.html` | The sidebar lists the spaces you've joined, with new-activity dots. A space's home shows its pages, members and recent activity. Sam's Guest list lives in its own `#party-guests` space. |
| 4b | `BrowseSpaces.dc.html` | Browse open spaces and join them; joining downloads their pages for offline use. Private spaces aren't listed. |
| 4c | `DirectSpace.dc.html` | Direct spaces between people. To share a page with Sam, drop it on Sam. Adding a third person starts a new direct space. |
| 4d | `GuestView.dc.html` | A guest (Dana) sees only the spaces they were added to, with a banner showing when access ends. |

## Refinement: shared pages keep their space

Feedback on screen 2b: a flat "Shared with me" list loses context. Pages from different spaces get mixed together, and two pages from the same space look unrelated.

| Screen | File | Shows |
|---|---|---|
| 5a | `PartialSpace.dc.html` | Sam's sidebar shows each space Sam has pages in, labelled "Some pages", with only those pages. Parents Sam can't open appear greyed out to keep the structure. |
| 5b | `ShareContext.dc.html` | When the space's name is itself secret (e.g. "Sam's surprise 40th"), the sharer can choose "On its own", which hides the space. |

## Open questions raised

1. Is per-page Share needed, or are spaces enough?
2. Can a share be view-only?
3. Can a share expire?
4. Who can share onward?
5. Should "everyone except Sam" be a one-click option?
