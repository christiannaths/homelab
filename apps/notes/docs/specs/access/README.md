# Specs: Access and sharing

- Status: Draft
- Decisions: [ADR-NOTE-011](../../adr/ADR-NOTE-011-access-control.md) (the access model) and [ADR-NOTE-012](../../adr/ADR-NOTE-012-page-permissions.md) (page access levels), both Accepted after the access spike ([findings](../../research/07-access-spike-findings.md)). How data reaches devices: [ADR-NOTE-013](../../adr/ADR-NOTE-013-data-layout.md) and [ADR-NOTE-001](../../adr/ADR-NOTE-001-offline-use.md).

LocalNotion copies **Notion's** sharing and permissions model, so it behaves the way Notion users already expect. These specs describe that model, adapted to a self-hosted instance for a few trusted people.

| Spec | Covers |
| --- | --- |
| [People and workspace roles](people-and-roles.md) | Workspace owners, members and guests; inviting people; changing roles |
| [Teamspaces](teamspaces.md) | Open, closed and private teamspaces; teamspace owners and members; teamspace settings |
| [Page sharing](page-sharing.md) | The Share menu, access levels, general access, inheritance and overrides, the Private and Shared sidebar sections |

## Terms

| LocalNotion | Notion | Note |
| --- | --- | --- |
| Instance | Workspace | One instance is one workspace. The specs say "workspace" to match Notion. |
| Admin ([ADR-NOTE-009](../../adr/ADR-NOTE-009-identity.md)) | Workspace owner |  |
| Account | Member or guest | Every person has a local password account. |

## Adapted from Notion, not copied

- **No plans or limits.** Notion features tied to paid plans (private teamspaces, more guests) are always available. Enterprise-only roles are left out: membership admins, organisation owners, restricted members, temporary members.
- **Groups** (named sets of people, like "Family") are left out of this version.
- **Public publishing** ("Share to web" in Notion) is decided separately, and is not covered here.
- **Offline first** ([ADR-NOTE-001](../../adr/ADR-NOTE-001-offline-use.md)). Notion is online-first, so in LocalNotion:
  - every page a person can open is on their devices and works offline, guests included (Notion does not let guests keep pages offline);
  - gaining access, losing access and role changes take effect at the device's **next sync**, not instantly. UI copy says "next time their device syncs";
  - when access is lost, the app removes those pages from the device at the next sync. Unsynced edits to them cannot be saved; the app says so and offers to keep the page, as the device had it, as a new private page.

## Verification

Notion's help centre could not be fetched while these specs were written. They are based on search summaries of Notion's help pages ("Sharing & permissions", "Intro to teamspaces", "Who's who in a workspace") and on general knowledge of Notion. The items first marked **(verify)** were checked in [`research/06-notion-access-verification.md`](../../research/06-notion-access-verification.md), and the differences it found are applied here.

Where Notion's help pages say nothing, the specs say **(LocalNotion choice)**. Most of these are the access spike's choices ([findings](../../research/07-access-spike-findings.md), "Choices Notion doesn't document"), and are listed under "Not decided yet" in the [ADR index](../../adr/README.md) for a product decision.

## Applies to every spec

**A person never sees a page they cannot open.** That covers its title, icon, content and comments, everywhere: sidebar, search, links, mentions, backlinks and notifications. A link or mention to such a page shows "No access", without the title.
