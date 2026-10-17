# Spec: Page sharing

- Status: Draft
- Part of: [Access and sharing](README.md)

## Access levels

| Level | Can |
|---|---|
| **Full access** | Read, comment, edit, and share with anyone, including changing other people's access |
| **Can edit** | Read, comment and edit, but not share |
| **Can edit content** (databases only) | Add and edit rows and their property values, but not change the database's properties, views, sorts or filters |
| **Can comment** | Read and comment |
| **Can view** | Read |
| **No access** | Nothing. Used to restrict an inherited level (see Inheritance) |

The UI does not offer what a level does not allow. The server also rejects edits from people below Can edit when their device syncs ([ADR 13](../../adr/0013-page-permissions.md)). Until comments exist, Can comment behaves like Can view.

## The Share menu

Every page has a **Share** button. It lists:

1. **An invite field:** add members or guests by name, choose a level, then **Invite**.
2. **People with access**, each with their level and where it comes from: "Invited", or inherited "from *Parent page*" or "from *Kitchen remodel* teamspace".
3. **General access**, with options depending on where the page lives:
   - in a teamspace: "*Teamspace* members" at a level, or "Only people invited";
   - in Private: "Only people invited" (the default), or "Everyone in the workspace" at a level.

Only people with Full access can change entries. Others see the list read-only.

## Inheritance

- **A new page inherits its parent's access.** A top-level page in a teamspace inherits the teamspace's default levels (see [Teamspaces](teamspaces.md)).
- **Any page can override what it inherits:**
  - **Expand:** invite more people, or raise someone's level, on just this page and its subpages.
  - **Restrict:** lower someone's inherited level, down to No access, on just this page and its subpages. The Share menu shows "Restricted" next to an overridden inherited entry, with **Restore inherited access**.
- **The most permissive level wins** when a person has access from more than one source: teamspace, parent page, direct invite or general access.
- A page that restricts what it inherits shows **Restricted** in the Share menu, with **Restore inherited access**. A page that only adds access shows no indicator.

## The Private and Shared sections

- **Private:** pages a member created outside any teamspace. Only they can see them until they share.
- **Shared:**
  - for the person who shared: Private pages they have shared with others move here;
  - for the recipient: pages shared with them directly that are not in a teamspace they belong to, each with its subpages.
- **Moving a page to Private** removes everyone else's access to that page. Explicit invites on its subpages stay, so each such subpage moves to the top of its invitee's Shared section; subpages that only inherited go with the page. This is Notion's behaviour, and LocalNotion follows it (Notion's help centre states the first part, and a third-party guide the subpage part: item 2 of the [Notion check](../../research/06-notion-access-verification.md)). The move asks first, naming who loses access.
- **Moving a page into a teamspace, or under a different parent,** changes what it inherits. If that changes who can see it, the move asks first and names the people affected. Such a move is a change of access, so it needs Full access on the page; Can edit may move a page only where nobody's access changes **(LocalNotion choice)**.

## Pages you can only partly reach

- If a person can open a page but not its parent, the page appears at the top level of their Shared section. Its breadcrumb skips the parents they cannot open.
- A link or mention to a page the reader cannot open shows "No access", without the title.
- When someone links or mentions a page that some readers of the current page cannot open, the editor warns them and offers to share it.

## Databases

- A database's rows (and their row pages) inherit the database page's access. A single row can also be shared on its own, like any page.
- **Can edit content** lets people work with rows without changing the database's structure: they add, edit and trash rows **(LocalNotion choice)** and edit their values and bodies, but not the database page itself (its title, body **(LocalNotion choice)** and views) or its properties.
- Notion's per-row rules ("people in this Person property can edit this row") are left out of this version.

## Acceptance criteria

1. Inviting someone to a page with Can view gives them read-only access to the page and its subpages.
2. Restricting an inherited level to No access on a subpage hides that subpage, and everything under it, from that person. Nothing about it, title included, reaches their devices.
3. **Restore inherited access** brings back the parent's level.
4. A person with Can view from the teamspace and Full access from a direct invite gets Full access.
5. Only people with Full access see editable controls in the Share menu.
6. A Private page shared with one person appears in the sharer's Shared section, and in the recipient's Shared section.
7. A page the recipient can open, whose parent they cannot, appears at the top of their Shared section, with a breadcrumb that skips the hidden parents.
8. Moving a page in a way that changes who can see it always asks first, naming the people affected.
9. People with Can edit content can add a row, but cannot add a property or change a view.
10. An edit from a Can view or Can comment person that reaches the server is rejected.
