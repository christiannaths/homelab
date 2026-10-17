# Spec: Teamspaces

- Status: Draft
- Part of: [Access and sharing](README.md)

A teamspace is a named section of the sidebar for a group of people, such as "Household", "Kitchen remodel" or "Book club". Every page belongs to a teamspace or to someone's Private section (see [Page sharing](page-sharing.md)).

## Kinds

| Kind | Who can see it exists | Who can join |
| --- | --- | --- |
| **Open** | Every member | Any member, without asking |
| **Closed** | Every member | Only people added by someone allowed to invite (see settings) |
| **Private** | Only its members, and workspace owners (by name only) | Only people added by someone allowed to invite |

Workspace owners can mark any teamspace they own as **default**, in Settings → Teamspaces: every current and new member joins it. Turning default off removes the members it added.

An open teamspace's pages are readable by every member, joined or not: members who haven't joined open them at the level for everyone else in the workspace (see Settings). Joining brings them up to the members' level.

Guests never belong to teamspaces. They only get individual pages.

## Roles inside a teamspace

| Role | Can |
| --- | --- |
| **Teamspace owner** | Everything a member can, plus: change the teamspace's settings, name, icon and kind; add and remove members; make members owners. Every teamspace has at least one owner. Archiving is for workspace owners (see below). |
| **Teamspace member** | Open the teamspace's pages at the access level its settings give members; create pages if that level allows it; leave the teamspace. |

## Settings (teamspace owners only)

- **Default access for each group:**

  | Group | Default | Options |
  | --- | --- | --- |
  | Teamspace owners | Full access | Fixed |
  | Teamspace members | Can edit | Full access, Can edit, Can comment, Can view |
  | Everyone else in the workspace (open teamspaces only) | Can view | Can view, Can comment, Can edit |

  These are the starting access levels for every top-level page in the teamspace. Subpages inherit them, and any page can override them (see [Page sharing](page-sharing.md)).

- **Who can invite members:** any member, or owners only (closed and private teamspaces).
- **Who can change the teamspace's sidebar** (add, move and reorder top-level pages): any member, or owners only.

## Joining, leaving and archiving

- **Browse teamspaces** lists every open and closed teamspace. Open ones have **Join**. Closed ones show their members, who can add you.
- A member can **leave** any teamspace. The last owner must make someone else an owner first.
- **Archiving** (workspace owners) removes the teamspace and its pages from everyone's sidebar. It cannot be deleted. A workspace owner who is also a teamspace owner restores it from Settings → Teamspaces → Archived, which puts it back in the sidebar of everyone who had access. Whether people keep access to archived pages through links is not decided.
- Workspace owners see every teamspace in Settings → Teamspaces, private ones included, and can add themselves to open and closed ones. Private teamspaces are listed there by name only: a workspace owner's devices receive the name, but none of its pages until a teamspace owner adds them. Notion's rule for private teamspaces is unconfirmed, so this is a **(LocalNotion choice)**.

## Sidebar

From top to bottom: **Favourites**, then **Teamspaces** (each one the person belongs to, as a collapsible section), then **Shared**, then **Private**. Shared and Private are covered in [Page sharing](page-sharing.md).

## Acceptance criteria

1. A private teamspace's name does not appear anywhere for non-members, including Browse and search, except to workspace owners in Settings → Teamspaces.
2. A member can join an open teamspace without anyone's approval, and can read its pages before joining. A closed teamspace offers no Join button.
3. Changing the members' default access updates every page that inherits it, and leaves pages with their own overrides alone.
4. A new member is in every default teamspace on first sign-in.
5. The last owner of a teamspace cannot leave it.
6. Guests never see teamspaces, even when a page they were given lives in one.
