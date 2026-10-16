# Specs: Access and sharing

- Status: Draft
- Decisions: [ADR 13](../../adr/0013-notion-style-access.md) (the access model), [ADR 14](../../adr/0014-notion-page-access-levels.md) (page access levels). Both are Proposed.

LocalNotion copies **Notion's** sharing and permissions model, so it behaves the way Notion users already expect. These specs describe that model, adapted to a self-hosted instance for a few trusted people.

| Spec | Covers |
|---|---|
| [People and workspace roles](people-and-roles.md) | Workspace owners, members and guests; inviting people; changing roles |
| [Teamspaces](teamspaces.md) | Open, closed and private teamspaces; teamspace owners and members; teamspace settings |
| [Page sharing](page-sharing.md) | The Share menu, access levels, general access, inheritance and overrides, the Private and Shared sidebar sections |

## Terms

| LocalNotion | Notion | Note |
|---|---|---|
| Instance | Workspace | One instance is one workspace. The specs say "workspace" to match Notion. |
| Admin ([ADR 11](../../adr/0011-local-password-accounts.md)) | Workspace owner | |
| Account | Member or guest | Every person has a local password account. |

## Adapted from Notion, not copied

- **No plans or limits.** Notion features tied to paid plans (private teamspaces, more guests) are always available. Enterprise-only roles are left out: membership admins, organisation owners, restricted members, temporary members.
- **Groups** (named sets of people, like "Family") are left out of this version.
- **Public publishing** ("Share to web" in Notion) is decided separately, and is not covered here.
- **Offline first** ([ADR 1](../../adr/0001-works-offline.md)). Notion is online-first, so in LocalNotion:
  - every page a person can open is on their devices and works offline, guests included (Notion does not let guests keep pages offline);
  - gaining access, losing access and role changes take effect at the device's **next sync**, not instantly. UI copy says "next time their device syncs";
  - when access is lost, the app removes those pages from the device at the next sync. Unsynced edits to them cannot be saved; the app says so and offers to keep them as a new private page.

## Verification

Notion's help centre could not be fetched while these specs were written. They are based on search summaries of Notion's help pages ("Sharing & permissions", "Intro to teamspaces", "Who's who in a workspace") and on general knowledge of Notion. Items marked **(verify)** should be checked against Notion before building.

## Applies to every spec

**A person never sees a page they cannot open.** That covers its title, icon, content and comments, everywhere: sidebar, search, links, mentions, backlinks and notifications. A link or mention to such a page shows "No access", without the title.
