# Notes

A self-hosted Notion clone. Terms follow Notion's, so people who know Notion already know them; [access specs](docs/specs/access/README.md) give the rules.

## Where pages live

**Instance**: One Notes server; holds many workspaces. _Avoid_: workspace (for the server), tenant

**Workspace**: A separate world of pages, people and teamspaces inside an instance; a person can belong to several and switches between them. _Avoid_: notebook, space, account

**Teamspace**: A named sidebar section inside a workspace, shared by a group of its people (e.g. "Household"); open, closed or private. _Avoid_: team, folder, group

**Private section**: Each person's own sidebar section in each workspace, for pages outside any teamspace; only they see it until they share. Not a teamspace. _Avoid_: Private teamspace (that's a teamspace kind), my pages, drafts

**Shared section**: Sidebar section for pages shared with someone, or by them, outside their teamspaces. _Avoid_: inbox, shared with me

**Page**: One document in the sidebar tree: a title and a body of blocks, possibly with subpages. _Avoid_: note, doc, document (for the user-facing thing)

**Subpage**: A page inside another page; inherits its parent's access unless it overrides it. _Avoid_: child page, nested page

**Trash**: Where deleted pages go, restorable until emptied. _Avoid_: bin, archive (teamspaces are archived, not trashed)

**Database**: A page holding rows with typed properties, shown through views. _Avoid_: table (that's a block or a view)

**Row**: One entry of a database; also a page, with its own body. _Avoid_: record, item

## People and access

**Notes access**: A person's App access to Notes, set by a homelab admin; lets them into the instance, not into any workspace. _Avoid_: Notes membership

**Workspace owner**: Runs a workspace: its settings, people and roles; whoever created it, plus anyone they promote. _Avoid_: admin (that's the homelab admin), creator

**Member**: A regular person in a workspace: the household. _Avoid_: user

**Guest**: An outsider given only specific pages; never in teamspaces or Private. _Avoid_: visitor, external user

**Teamspace owner** / **Teamspace member**: A teamspace's managers and participants. _Avoid_: teamspace admin

**Access level**: How far someone may go on a page: Full access, Can edit, Can edit content, Can comment, Can view, No access ([ADR-NOTE-012](docs/adr/ADR-NOTE-012-page-permissions.md)). _Avoid_: permission, role

**General access**: A page's level for everyone in its teamspace or workspace, beside individual invites. _Avoid_: public, link sharing

**Share**: Giving people an access level on a page. _Avoid_: publish (that's Share to web)
