# Spec: Access and sharing

- Status: Draft
- Decisions: [ADR 13](../adr/0013-spaces-and-page-shares.md) (spaces and page shares), [ADR 14](../adr/0014-google-docs-style-roles.md) (roles). Both are Proposed.
- Mockups: [`docs/design/access/`](../design/access/README.md). Row 6 is the model this spec describes.

This spec describes what users see and can do. How it's built is out of scope: feasibility under offline sync is assessed separately, and the open questions at the end may change details here.

## 1. Goals

- People can keep things to themselves: drafts, journals, personal notes.
- People can share part of what they have: a few pages of a project, everything except a surprise.
- People outside the household get exactly what they need: a contractor's project, a babysitter's manual.
- Shared things keep their context, so a recipient sees where pages belong, not a flat list.
- Nobody sees a title, snippet or search result from a page they can't open.

**Non-goals for this version:** public links (publishing is decided separately), time-limited access, guest account types, end-to-end encryption.

## 2. Concepts

| Term | Meaning |
|---|---|
| **Space** | A named, top-level group of pages, e.g. "Household" or "Party for Sam". Every page belongs to exactly one space. |
| **Private** | Each account's own space. Only its owner sees it, and it can't be shared as a whole. Its pages can still be shared one by one. |
| **Space share** | Gives people some or all of a space's pages, shown under the space's name. |
| **Page share** | Gives people one page and its subpages, on their own, with no space name. |
| **Member** | Someone with a space share that includes every page and every new page. Not a separate concept. |
| **Role** | What a share allows: Viewer, Commenter or Editor. Each space also has one Owner. |
| **New-page rule** | Part of a space share: what happens to pages created later. Visible, hidden, or ask whoever creates it. |

## 3. Roles

| Can… | Viewer | Commenter | Editor | Owner |
|---|---|---|---|---|
| Read pages they have access to | ✓ | ✓ | ✓ | ✓ |
| Comment (once comments exist) | | ✓ | ✓ | ✓ |
| Edit, create, move and trash pages | | | ✓ | ✓ |
| Share, and change other people's access | | | ✓ unless the Owner turns this off | ✓ |
| Rename the space | | | ✓ | ✓ |
| Delete the space, transfer ownership, turn off sharing by Editors | | | | ✓ |

- The default role when sharing is **Editor**.
- If someone has access through more than one share, the **most permissive role wins**.
- The Owner is the space's creator until ownership is transferred. Every space has exactly one Owner.
- Until comments exist, Commenter behaves like Viewer, and the role picker labels it "Commenter (comments coming soon)".

## 4. The sidebar

From top to bottom:

1. **Spaces the person has full access to**, by name, each with all its pages.
2. **Spaces the person has partial access to**, by name, tagged "N of M pages", showing only the pages they can see. Parents they can't see aren't shown; a visible page whose parent is hidden appears at the space's top level.
3. **Pages shared with you**: page shares, each marked with the sharer's avatar. Subpages nest as usual.
4. **Private.**

On pages hidden from at least one person with access to the space, members with sharing rights see a crossed-out eye. Hovering or tapping it lists who can't see the page: "Hidden from Sam".

## 5. Flows

### 5.1 Inviting someone to the instance (6a)

An admin creates the account ([ADR 11](../adr/0011-local-password-accounts.md)) and ticks which spaces the person joins. Only spaces the admin owns or can share are listed. Nothing is ticked by default. A person who joins no spaces starts with only their Private space.

### 5.2 Creating a space (1b)

"New space" asks for a name and, optionally, people to add as members (Editor by default). The creator becomes the Owner.

### 5.3 Sharing a space (6b)

Opened from the space's menu, or from the "The whole space…" tab of the Share dialog.

1. **People:** add one or more people, each with a role.
2. **Pages:** the space's page tree with checkboxes, all ticked. Unticking a page unticks its subpages. A counter shows "N of M". Ticking a subpage whose parent is unticked is allowed, and the subpage shows at the top level for the recipient.
3. **New pages:** Visible (default when every page is ticked), Hidden (default when any page is unticked), or Ask whoever creates it.
4. **Footer:** "They'll see the space name and its member list." Confirm button: "Share N pages".

Editing a share later reopens the same dialog for that person.

### 5.4 Sharing a page (6c)

The Share button on a page opens the "This page" tab: add people with a role. The summary reads "Sam gets *Dietary needs* and its 1 subpage, on their own. Nothing else from this space, not even its name." A hint points to "The whole space…" for sharing with context.

### 5.5 Creating a page in a partly shared space (6e)

- **Visible:** the page is shared straight away. No prompt.
- **Hidden:** the page is hidden from those people, with the crossed-out eye. No prompt.
- **Ask:** the new page shows a bar: "This space is partly shared with Sam. Should Sam see '*Title*'?", with **Keep hidden** and **Show to Sam**. The page stays hidden until someone answers, and the bar stays until then.
- A new subpage always follows its parent and never prompts.

### 5.6 Moving pages (3a)

If a move changes who can see a page, a confirmation names the people affected before the move happens:
- Gained: "Share *Gift ideas* and its 3 pages with Alex and Jo?"
- Lost: "Alex and Jo will lose access to *Gift ideas*."

Moves that change nobody's access happen without a prompt.

### 5.7 Linking to a page (3b)

When an editor inserts a link or @mention to a page that some readers of the current page can't see, a popover names them, with **Link anyway** and **Share it with them**. Those readers see "Page you don't have access to", with a lock and no title.

### 5.8 Changing or removing access (3c)

Roles and page selections are edited in the share dialogs. Removing a person from a space or page asks first: "*Jo* loses access next time their device syncs."

### 5.9 Leaving and deleting

- Anyone except the Owner can **leave** a space or a page share. The Owner must transfer ownership first.
- **Deleting a space** (Owner only) moves its pages to the Owner's trash and removes everyone else's access.

## 6. What a person must never see

For any page a person can't open:
- no title, icon, snippet or content anywhere: sidebar, search, link previews, backlinks, recent pages or notifications;
- no counts beyond the "N of M pages" tag on a space they partly see;
- in search, no indication that a result was filtered out.

## 7. Offline behaviour

- Everything a person can see is on their device and works offline. Viewers and Commenters have read-only copies offline.
- **Gaining access:** new pages arrive at the next sync.
- **Losing access:** at the next sync, the app removes those pages from the device and from the sidebar. If the person had unsynced edits to them, the app explains that the edits couldn't be saved and offers to keep them as a new page in Private.
- **Role changes** take effect at the next sync. Unsynced edits made before a downgrade to Viewer are handled like lost access.
- UI copy says "next time their device syncs", never "immediately".

## 8. Acceptance criteria

1. A newly invited person who joins no spaces sees only Private, and search finds nothing else.
2. A space shared with 3 of its 6 pages shows "3 of 6 pages" to the recipient and lists only those 3. None of the other 3 titles appear anywhere for the recipient.
3. Unticking a parent page in the share dialog also hides its subpages.
4. With the new-page rule set to Hidden, a page created later doesn't appear for the recipient. With Visible, it does, without a prompt. With Ask, it's hidden until someone answers the prompt.
5. A subpage created under a shared page is visible to the recipient, and one created under a hidden page isn't, whatever the new-page rule.
6. A page share shows the page under "Pages shared with you" with the sharer's avatar, and the space's name doesn't appear anywhere for the recipient.
7. Someone with access through two shares gets the more permissive role.
8. A Viewer can't edit, and the editing UI isn't offered. An edit forced through anyway is rejected when the device syncs.
9. With "Editors can share" turned off, Editors don't see the Share controls.
10. Moving a page that changes access always shows a confirmation naming the people affected. A move that changes nobody's access shows none.
11. A link to a page the reader can't open shows "Page you don't have access to", with no title.
12. After someone's access is removed, their device removes the pages at its next sync. Their unsynced edits are offered as a copy in Private.
13. The Owner can't leave a space without transferring ownership. Deleting a space sends its pages to the Owner's trash.

## 9. Open questions

1. **Space names in partial shares:** a space's name can itself be a secret ("Sam's surprise 40th"). Today the answer is "use a page share". Is a warning in the share dialog enough?
2. **Who answers the new-page prompt:** only the page's creator, or any Editor of the space?
3. **The crossed-out eye with many shares:** does a hover list scale, or does the space need a "Sharing overview" page?
4. **Notifications:** should people be told when something is shared with them, and with an optional message, as in Google Docs?
5. **"Request access":** should a link to a page you can't see let you ask for access?
6. **Time-limited shares** (babysitter, contractor): a later extension to [ADR 14](../adr/0014-google-docs-style-roles.md).
7. **Instance admins:** do they get any in-app view of spaces they aren't in, for example to recover the spaces of someone who has left?
