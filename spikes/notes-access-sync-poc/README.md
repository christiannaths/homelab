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
- **The server works levels out** from every page's `meta` and `access` (`PageCatalog`, through `model/src/access.ts`), and checks every update before applying it: below Can edit nothing is applied, and below Full access an update that touches `access` is refused (`beforeSync`, `reviewUpdate`, `refuseUpdate`; see "Rejecting edits" below).
- **Rejected:** a separate `access:<pageId>` document (doubles the document count, and the two must always carry the same access); access in SQLite with an HTTP API (not Yjs, so no offline sharing and no merge, against ADR 2); access entries in the per-person index (every sharer's change would be fanned out by the server, and the Share menu needs entries for other people).

## Rejecting edits, and getting back in step (#18)
- **The app doesn't offer the edit.** Below Can edit the title and editor are read-only, online and offline, because the level comes from the person's page index, which is stored on the device like any document.
- **The server still checks every update it receives** (`beforeSync` → `reviewUpdate` in `model/src/review.ts`), whatever the connection was opened as: the live updates and the SyncStep2 a device sends on every (re)connect. It uses the person's level **now**, not the level at open, so a change of access applies to an open connection at once (raising someone to Can edit lets their read-only connection write). Full access is accepted without decoding the update. Otherwise the update is applied to a scratch copy to see what it touches (`previewUpdate`): nothing new is always fine, below Can edit anything is refused, and below Full access a change to `access` is refused.
- **A new page is checked where it is placed.** A page the server has never seen is reviewed as if it already existed where its first update puts it, with no access of its own (`placementLevel`). Creating it needs Can edit there (refused: a page in someone else's Private section, under a page the creator can only view, or content with no `meta`), and any access it sets needs Full access there. A parent the server hasn't seen yet (a subpage created offline before its parent synced) counts as missing, so the page's own `section` decides, as in the tree (ADR 7); the parent is checked when it arrives.
- **A refused update is refused whole** and closes that one document's connection with the reason (`read-only`, `access-change-refused` or `placement-refused`, the `Refusal` type). The socket and the person's other documents are untouched. The close message is the signal because Hocuspocus passes only its reason on to the device. Hocuspocus's own read-only handling isn't relied on: it drops the update without saying so, so the device stays out of step and resends it on every reconnect.
- **Recovery: throw the local copy away and sync it again.** A Yjs update can't be taken back, and the device already applied it. On a refusal the device destroys the document's provider, its `Y.Doc` and its IndexedDB store, then opens it again from the server's state (`SyncManager.recover`, the same in the test client). Nothing refused is left anywhere to be sent again. Providers use `sessionAwareness: true` so the reopened provider has its own address on the socket and can't be mistaken for the closing one. The UI follows the replaced document (`onReset`, and a new editor per `generation`).
  - **Cost:** changes made on that page and not yet acknowledged when the refusal arrived are lost with the copy, and so is anything after the refused update in the same batch. That only happens to a device that sent something it wasn't allowed to, or edited offline while its access was lowered. #21 can keep the discarded content and offer it back as a Private page (snapshot it in `recover` before destroying the doc).
  - **Rejected:** keeping the connection open and only answering "not applied" (Hocuspocus's read-only path): the device stays diverged forever. Reverting with an inverse update: Yjs can't express one for someone else's insertions, and it would be the server writing repairs (ADR 7).
- **What this changes in ADR 12:** "authentication runs once per connection" no longer holds. Authorization is **per document**: `onAuthenticate` runs for each document a connection opens (Hocuspocus does this anyway) and decides open, read-only or refused from the access rules; and **per update**: every update is checked against the person's current level before it is applied, so the server is no longer a plain relay of whatever an authenticated connection sends. The session check itself (who the person is) can still be done once per connection and cached.
- **Cost on the server:** one copy of the document per update checked, only for connections below Full access, and for new pages. #22 should measure it on large pages.

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
