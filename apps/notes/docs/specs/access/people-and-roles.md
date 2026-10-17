# Spec: People and workspace roles

- Status: Draft
- Part of: [Access and sharing](README.md)

## Roles

| Role | Who | Can |
| --- | --- | --- |
| **Workspace owner** | Whoever set up the instance, plus anyone they promote | Everything a member can, plus: manage workspace settings; invite and remove people; change anyone's role; reset passwords ([ADR-NOTE-009](../../adr/ADR-NOTE-009-identity.md)); manage teamspaces they are not in (see [Teamspaces](teamspaces.md)). There is always at least one. |
| **Member** | The household: people who use the instance regularly | Create pages in their Private section and in teamspaces they can edit; join open teamspaces; create teamspaces; share pages they have Full access to, with members or guests. |
| **Guest** | Outsiders: a contractor, a babysitter, an accountant | Open only the pages shared with them, at the level given (see [Page sharing](page-sharing.md)). |

### What guests cannot do

- Join teamspaces, or see that teamspaces exist.
- See pages shared with "everyone in the workspace".
- Create pages of their own: no Private section and no top-level pages. They can only create subpages inside a page they can edit, and get the level they inherit there, not Full access **(LocalNotion choice)**.
- Share, unless given **Full access** to a page. They can then share that page, including with other guests.

## Inviting people

- Only workspace owners can invite people to the workspace as **members**. A workspace setting, **Allow members to request adding other members**, lets members ask; a workspace owner approves or declines. Here it is off by default.
- Anyone with **Full access** to a page can invite a **guest** to it. If the person has no account yet, the invite creates a guest account. A workspace owner can turn off guest invites for the whole workspace.
- An invite creates a local account with a temporary password ([ADR-NOTE-009](../../adr/ADR-NOTE-009-identity.md)). The person changes the password on first sign-in.
- New members automatically join the workspace's **default teamspaces** (see [Teamspaces](teamspaces.md)).

## Changing roles

- Workspace owners change roles in **Settings → People**: promote a member to owner, demote an owner to member, convert a guest to a member, or remove someone.
- Converting a member to a guest removes their teamspace memberships. They keep any pages shared with them directly.
- **Removing someone** stops their syncing and removes their access at their devices' next sync. Their Private pages stay on the server. Within 30 days, a workspace owner can transfer them, once, to another member (Settings → People → Recently left); they appear in that member's Private section under a new top-level page. Pages already shared with a current member are not transferred; they stay where they are. The 30-day limit is Notion's retention rule; LocalNotion may choose to keep them longer.

## Acceptance criteria

1. A guest sees only the pages shared with them, with no teamspaces and no Private section.
2. A guest with Can edit can create subpages inside the shared page, but nowhere else.
3. A guest with Full access can share that page. A guest with any lower level sees no sharing controls.
4. Only workspace owners see Settings → People, and only they can change roles.
5. A new member automatically joins every default teamspace.
6. After someone is removed, their devices remove the workspace's pages at their next sync.
