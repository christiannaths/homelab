# Notion access verification (Oct 2026)

**Goal:** check every item the [access specs](../specs/access/README.md) mark **(verify)** against Notion's help centre, for [#13](https://github.com/christiannaths/homelab/issues/13) of the access spike ([#11](https://github.com/christiannaths/homelab/issues/11)). The specs and ADRs are not changed here; the spike's write-up applies any differences.

## How this was checked

- **Notion's help centre still could not be read directly.** The session's network policy refuses `www.notion.com` (and `notion.so`), so neither `curl` nor a page fetch reached it. To read the pages directly, add `www.notion.com` to the environment's allowed domains.
- Instead, each item was checked through web searches limited to Notion's own help pages. The quotes below are Notion's wording as the search results gave it, linked to the page they came from. They are close to primary, but are not a reading of the whole page, so a missing statement is not proof that Notion doesn't say it.
- Third-party guides (Thomas Frank and others) are cited only where Notion's pages say nothing, and are marked as such.
- Notion's behaviour often depends on plan. The specs treat every paid feature as on, so the Business/Enterprise behaviour is the one that counts here.

## Summary

| # | Spec item | Result |
| --- | --- | --- |
| 1 | Indicator when a page's access differs from its parent | Partly matches |
| 2 | Moving a page to Private keeps explicit invites on its subpages | Couldn't confirm from Notion (third party agrees) |
| 3 | Only workspace owners invite members; a setting lets members invite | **Differs** |
| 4 | A removed person's private pages can be transferred by an owner | Matches, with limits |
| 5 | Only open teamspaces can be default | Couldn't confirm; Notion's wording suggests otherwise |
| 6 | Workspace members outside an open teamspace: "None until they join" | **Differs** |
| 7 | Archiving: owners only, pages readable from the archive, workspace owners restore | **Differs** in part |
| 8 | Workspace owners see open and closed teamspaces in Settings; private ones by name only | Partly matches; private part couldn't be confirmed |

Items 2, 6 and 8 change what the spike must test (see the last section).

## 1. Indicator when access differs from the parent

- **Spec** ([page-sharing.md](../specs/access/page-sharing.md), Inheritance): "A page whose access differs from its parent shows a small indicator in the Share menu."
- **Notion:** no help page found describes the indicator. Third-party guides describe it only for _narrowed_ access: "If you change a page's permissions in any way that reduces access compared to the page's parent, that page becomes Restricted" ([Thomas Frank](https://thomasjfrank.com/notion-sharing-permissions-the-ultimate-guide/)), with a message that "this page does not inherit all sharing settings from the parent page" and a **Restore** button ([MashTips](https://mashtips.com/share-notion-page-and-manage-permissions/)).
- **Result:** partly matches. The spec already has "Restricted" and **Restore inherited access** for restricted entries; nothing shows Notion marks pages whose access was only _expanded_.
- **Proposed wording:** "A page that restricts what it inherits shows **Restricted** in the Share menu, with **Restore inherited access**. Pages that only add access show no indicator." Or keep the general indicator as a deliberate LocalNotion choice and drop "(verify)".

## 2. Moving a page to Private

- **Spec** ([page-sharing.md](../specs/access/page-sharing.md), Private and Shared): moving a page to Private removes everyone else's access to it; "explicit invites on its subpages stay".
- **Notion:** "Moving a shared page to the Private section of your sidebar will remove everyone else's access on that page" ([Sharing & permissions](https://www.notion.com/help/sharing-and-permissions)); the sidebar page gives the same warning for pages dragged into Private ([Navigate with the sidebar](https://www.notion.com/en-gb/help/navigate-with-the-sidebar)). No Notion page found says what happens to subpages. A third-party guide says it removes everyone's access to that page "but leaves its subpages exactly as they were" ([Thomas Frank](https://thomasjfrank.com/notion-sharing-permissions-the-ultimate-guide/)).
- **Result:** first half matches; the subpage half couldn't be confirmed from Notion, and the one source that covers it agrees with the spec.
- **Note:** "exactly as they were" may mean more than explicit invites. A subpage with its own Restricted/expanded settings keeps them; a subpage that only inherited loses access along with its parent. That reading is what the spec already says.

## 3. Who can invite members

- **Spec** ([people-and-roles.md](../specs/access/people-and-roles.md), Inviting people): only workspace owners invite members; "In Notion, members can sometimes invite too, depending on a workspace setting. Here, that setting is off by default."
- **Notion:** regular members "can't change workspace settings or invite new members into the workspace"; workspace owners "can change workspace settings and invite new members"; membership admins (Enterprise) can invite but not change settings ([Who's who in a workspace](https://www.notion.com/help/whos-who-in-a-workspace), [Adding members, admins & guests](https://www.notion.com/help/guides/adding-members-admins-and-guests)). A member without invite access instead gets "the option to request to add a member" ([Manage members, admins & guests](https://www.notion.com/help/add-members-admins-guests-and-groups)). The workspace setting is **"Allow members to request adding other members"** (Plus plan and up), under Security ([Workspace settings](https://www.notion.com/help/workspace-settings)); owners and membership admins approve or decline requests.
- **Result:** differs. Owners-only inviting matches, but Notion's setting lets members _request_ an invite, not send one.
- **Proposed wording:** "Only workspace owners can invite people to the workspace as **members**. A workspace setting, **Allow members to request adding other members**, lets members ask; a workspace owner approves or declines. Here it is off by default." (Or leave requests out of this version.)

## 4. Transferring a removed person's private pages

- **Spec** ([people-and-roles.md](../specs/access/people-and-roles.md), Changing roles): a removed person's private pages stay on the server and a workspace owner can transfer them to someone else.
- **Notion:** "A workspace owner is able to reassign the private content of a user who has recently left the workspace if … the user's private pages were not already reassigned … the user was part of the workspace fewer than 30 days ago, and the workspace is on an Enterprise Plan." "Content shared with a current workspace member will not be transferrable." The pages "appear in the destination user's sidebar, nested under a new top-level private page." Done from Settings → Members → **Recently left users** ([Transfer content from a deprovisioned user](https://www.notion.com/help/transfer-content-deprovisioned-user)). Removal itself is immediate: the person "will instantly lose access to the workspace" ([Manage members, admins & guests](https://www.notion.com/help/add-members-admins-guests-and-groups)).
- **Result:** matches, with limits the spec doesn't state.
- **Proposed wording:** "…Their Private pages stay on the server. Within 30 days, a workspace owner can transfer them, once, to another member (Settings → People → Recently left); they appear in that member's Private section under a new top-level page. Pages already shared with a current member are not transferred; they stay where they are." The 30-day limit is Notion's retention rule; LocalNotion may choose to keep them longer.

## 5. Which teamspaces can be default

- **Spec** ([teamspaces.md](../specs/access/teamspaces.md), Kinds): "Notion only lets open teamspaces be default, so the same rule applies here."
- **Notion:** workspace owners "can designate default teamspaces" that "all new and current workspace members will automatically join", and "can search for and add any teamspaces that they own to the list of defaults" (Settings → Teamspaces). Making a teamspace default adds every workspace member except restricted members; turning it back into a regular teamspace removes them ([Manage teamspaces](https://www.notion.com/help/manage-teamspaces), [Intro to teamspaces](https://www.notion.com/help/intro-to-teamspaces)). No Notion page found limits defaults to open teamspaces. A third-party guide implies a default teamspace can be closed or private ([super.so](https://super.so/blog/how-to-delete-a-teamspace-in-notion)); another, older one claims it is always open.
- **Result:** couldn't confirm. Notion's wording ("any teamspaces that they own") points the other way: default is a membership rule, separate from the kind.
- **Proposed wording:** "Workspace owners can mark any teamspace they own as **default**: every current and new member joins it. Turning default off removes the members it added." If the open-only rule is kept, say it is a LocalNotion choice, not Notion's. Also note who sets it: **workspace owners**, in Settings → Teamspaces, not teamspace owners in teamspace settings.

## 6. Access for workspace members outside an open teamspace

- **Spec** ([teamspaces.md](../specs/access/teamspaces.md), Settings): "Everyone else in the workspace (open teamspaces only) | None until they join | None, Can view, Can comment, Can edit".
- **Notion:** "Open: Anyone can join and **view the content** inside this teamspace" ([Intro to teamspaces](https://www.notion.com/help/intro-to-teamspaces)). Teamspace owners "can set up default permissions for teamspace owners, teamspace members, and workspace members who don't belong to the teamspace. These default permissions will apply to every new page created in a teamspace" ([Intro to teamspaces](https://www.notion.com/help/intro-to-teamspaces)). "In an Open teamspace, you can choose which permission level to give people who aren't members of the teamspace: either Can Edit, Can Comment, or Can View" ([Grant access with teamspaces and groups](https://www.notion.com/help/guides/grant-access-teamspaces)). Another guide says that in open teamspaces "everyone automatically has access to all pages" ([Teamspaces give every team a home](https://www.notion.com/help/guides/teamspaces-give-teams-home-for-important-work)).
- **Result:** differs. In Notion, members who haven't joined an open teamspace can read its pages, and the options Notion lists don't include None. The exact default for a new open teamspace wasn't stated; Notion's own example and "anyone can … view" point to **Can view**.
- **Proposed wording:** "Everyone else in the workspace (open teamspaces only) | Can view | Can view, Can comment, Can edit". If LocalNotion wants "None" as an option, say it is an addition.

## 7. Archiving a teamspace

- **Spec** ([teamspaces.md](../specs/access/teamspaces.md), Joining, leaving and archiving): "Archiving (owners only) removes the teamspace from everyone's sidebar. Its pages stay readable from the archive, and workspace owners can restore it."
- **Notion:** "Workspace owners can archive a teamspace. A teamspace can only be archived, not deleted." To restore: Settings → Teamspaces → **Archived** filter → ••• → **Restore teamspace**; only workspace owners who are also owners of that teamspace can restore it, and "the teamspace and all of its content will be re-added to everyone's sidebars who previously had access" ([Manage teamspaces](https://www.notion.com/help/manage-teamspaces)). A third-party guide says the teamspace's pages leave the sidebar and an open page shows a banner that it is in an archived teamspace ([Make Tech Easier](https://maketecheasier.com/delete-archive-notion-teamspace/)). No source says whether archived pages stay editable or become read-only.
- **Result:** differs in part. Archiving is a **workspace-owner** action in Notion (the spec says teamspace owners; one third-party guide says teamspace owner). Restoring needs someone who is both. "Readable from the archive" couldn't be confirmed.
- **Proposed wording:** "**Archiving** (workspace owners) removes the teamspace and its pages from everyone's sidebar. It cannot be deleted. A workspace owner who is also a teamspace owner restores it from Settings → Teamspaces → Archived, which puts it back in the sidebar of everyone who had access." Whether people keep access to archived pages through links stays open.

## 8. Workspace owners and teamspaces in Settings

- **Spec** ([teamspaces.md](../specs/access/teamspaces.md), Joining, leaving and archiving): workspace owners see every open and closed teamspace in Settings and can add themselves; private teamspaces are listed by name only, and owners join them through the teamspace's own owners.
- **Notion:** in Settings → Teamspaces, workspace owners "can manage settings for all teamspaces in the workspace", set default teamspaces and limit teamspace creation to owners ([Manage teamspaces](https://www.notion.com/help/manage-teamspaces)). Browsing (any member) shows "all open and closed teamspaces in the workspace"; private teamspaces aren't listed for non-members ([Create, join & leave teamspaces](https://www.notion.com/help/browse-join-and-create-teamspaces)); a private teamspace "won't be visible to people who are not added" ([Intro to teamspaces](https://www.notion.com/help/intro-to-teamspaces)). A third-party guide says workspace owners on Enterprise can give themselves access to closed and private teamspaces ([Thomas Frank](https://thomasjfrank.com/notion-sharing-permissions-the-ultimate-guide/)); no Notion page found confirms it.
- **Result:** partly matches. "All teamspaces" in Settings suggests workspace owners see private ones too, but neither the "name only" listing nor how owners get in could be confirmed.
- **Proposed wording:** keep as is, marked as a LocalNotion choice, or follow the third-party reading: "Workspace owners see every teamspace in Settings → Teamspaces, private ones included, and can add themselves to any of them."

## What changes for the spike

1. **Open teamspaces reach every member's devices (item 6).** If non-joined members get Can view by default, an open teamspace's pages are synced to every member, not only to people who joined. The spike's per-person sync must treat "workspace member" as a grant source on open teamspaces, and test that changing it to Can edit, or to None if kept, updates every non-member's devices at the next sync. User story 7 ("join an open teamspace … to see the household's pages") and story 8 still hold; the spike should add a test that a member who hasn't joined an open teamspace can still read its pages.
2. **Private teamspace names and workspace owners (item 8).** If workspace owners see every teamspace in Settings, a private teamspace's name reaches workspace owners' devices even when they're not members. The "private teamspace name never reaches a non-member's device" test (user story 9, teamspaces acceptance criterion 1) needs an explicit rule for workspace owners before it is written, and where access data lives must allow it.
3. **Moving a page to Private keeps subpage grants (item 2).** A person with an explicit grant on a subpage keeps it after the parent moves to Private, so that subpage must jump to the top of their Shared section with the parent hidden. That is the hidden-parent case (stories 25, 26, 44) arising from a move rather than a share, and the spike should test it: move a parent to Private, check the subpage stays on the invited person's device and the parent leaves it.
4. Items 3, 4, 5 and 7 change spec wording but not the spike's risks: inviting, content transfer, default teamspaces and archiving are out of the spike's tests apart from default-teamspace joining (story 10), which works the same whatever kinds may be default.
