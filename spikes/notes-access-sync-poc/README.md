# Notes: access model on per-person sync (spike)

A throwaway spike for [issue #11](https://github.com/christiannaths/homelab/issues/11): can Notion's access model (Notes [ADR 13](../../apps/notes/docs/adr/0013-notion-style-access.md) and [ADR 14](../../apps/notes/docs/adr/0014-notion-page-access-levels.md)) be built on Yjs documents synced whole by Hocuspocus, when each device may only receive the pages its person can open? It starts from a copy of the frozen [block editing spike](../notes-block-editing-collaboration-poc/README.md), and is left out of repo-wide runs ([ADR 16](../../docs/adr/0016-spikes-stay-out-of-repo-wide-runs.md)).

## Packages
- `model` (`notes-access-sync-poc-model`): pure TypeScript, no DOM. The page tree, the workspace document helpers, the people rules and the **access rules** (`access.ts`).
- `server` (`notes-access-sync-poc-server`): Hocuspocus with SQLite storage, run straight from TypeScript (`node src/index.ts`). Also holds the **sync-boundary** test helpers in `testing/`.
- `web` (`notes-access-sync-poc-web`): the React PWA, with BlockNote and offline storage in IndexedDB.
- `e2e` (`notes-access-sync-poc-e2e`): **two-browser** Playwright tests against real server processes.

## Identity is faked
On a new workspace the app asks for the first person, who becomes the workspace owner. The owner adds members and guests under People. Anyone opening the app picks who they are from a list. The person's id is the connection token, and the server trusts it.

## Where access data lives (#15)
- **The access set on a page lives in that page's own document**, in an `access` Y.Map beside `meta` and `content`: one key per entry, `person:<id>` → level (an invite, or an override of what the person inherits) and `workspace` → level (general access for everyone in the workspace; guests never get it). An absent key inherits from the parent page.
  - It reaches exactly the people who can open the page, who are also the people Notion shows the Share menu to (read-only below Full access). Nobody receives the access entries of a page they can't open.
  - Access changes are ordinary Yjs edits, so they work offline and merge like any other data: invites for different people both survive, and two changes to the same entry end with the same winner everywhere (convergence tests in `model/src/sharing.test.ts`).
  - The sharer's sidebar needs it: a top-level Private page with any invite or general access moves to their Shared section.
- **Each person's levels live in their page index** (`index:<personId>`, id → level), written only by the server. A level depends on ancestors the device may not hold, so devices never work out their own level: they read it from the index to decide what to offer (editing, the Share menu).
- **The server works levels out** from every page's `meta` and `access` (`PageCatalog`, through `model/src/access.ts`), and checks every update before applying it: below Can edit nothing is applied, and below Full access an update that touches `access` is refused (`beforeSync`, `touchedRoots`, `refuseUpdate`).
- **Rejected:** a separate `access:<pageId>` document (doubles the document count, and the two must always carry the same access); access in SQLite with an HTTP API (not Yjs, so no offline sharing and no merge, against ADR 2); access entries in the per-person index (every sharer's change would be fanned out by the server, and the Share menu needs entries for other people).

## Teamspaces (#17)
- **Each teamspace is its own document**, `teamspace:<id>`: a `settings` map (name, kind, default flag, the members' default level, and on open teamspaces the level for everyone else) and a `members` map (person id → owner or member). One key per field and per member, so concurrent joins and setting changes merge.
- **It reaches exactly the people who may see the teamspace's name**: every workspace member for open and closed teamspaces (read-only for non-members of a closed one), only members and workspace owners for private ones, never guests. Page indexes list the teamspaces a person may open beside their pages, so a private teamspace's id doesn't reach anyone else either.
- **Pages in a teamspace** have the section `teamspace:<id>`. Teamspace owners always have Full access on its pages, which no default or page override lowers (the teamspaces spec, Settings). Top-level pages start from the teamspace's defaults: members get the members' level, and on an open teamspace everyone else in the workspace gets the non-member level as general access (as in Notion: there is no "None", and members who haven't joined still open its pages). A page can override the members' level for itself and its subpages (the page's `access` key `teamspace`), and a change to the teamspace's default reaches every page that doesn't.
- **Changes are checked on the server** before they are applied (`refuseTeamspaceChange`): anyone may join an open teamspace, members add people to closed and private ones, only teamspace owners change settings and roles, only workspace owners make a teamspace default (any kind), and the last owner can't leave. New members are added to every default teamspace by the server.

## Overrides and hidden parents (#16)
- **A per-person entry on a subpage overrides what that person inherits**, for the subpage and everything below it: a higher level expands, a lower one restricts, "none" hides the subtree, and deleting the entry is Restore inherited access. General access overrides the same way.
- **Most permissive wins across sources.** A per-person No access only replaces that person's own entry: it doesn't beat general access (or, later, teamspace access), as in Notion and ADR 14. The Private section's member always keeps Full access.
- **When a person loses a page on the server, the server closes their open connections to it** (reason `access-revoked`), so a restricted page stops reaching a device that already had it. What the device does with its local copy is #21.
- **A page someone can open below one they can't** arrives alone: their device builds its tree from what it received, so the page is top-level there (in Shared), and the breadcrumb (`breadcrumb()`) starts at it. The hidden parent's document and title never arrive. Its **id** does, as the page's `parentId`: the page's editors write it, and it is a random UUID.
- **The Share menu lists inherited entries** with the page they come from (`shareEntries()`), built from the pages the device holds. Entries inherited from above a hidden parent can't be listed, and the menu says so.

## Run it
From the repo root (Node.js 26+):
```sh
npm install
npx nx build notes-access-sync-poc-web
npx nx start notes-access-sync-poc-server   # http://localhost:3000, data in spikes/notes-access-sync-poc/data
```

## Tests
```sh
npx nx run-many -t typecheck test -p 'tag:scope:notes-access-sync-poc'   # unit and sync-boundary tests
npx nx e2e notes-access-sync-poc-e2e   # builds the web app, then runs Playwright
```
Set `PLAYWRIGHT_CHROMIUM_PATH` to use an already-installed Chromium.
