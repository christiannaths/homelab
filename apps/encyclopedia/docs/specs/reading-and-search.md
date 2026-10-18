# Reading and search

- Status: Draft
- Decisions: [ADR-ENCY-002](../adr/ADR-ENCY-002-article-serving.md) (serving and search), [ADR-ENCY-005](../adr/ADR-ENCY-005-offline-use.md) (offline), [ADR-ENCY-006](../adr/ADR-ENCY-006-article-presentation.md) (look).

## Opening the app

- The app opens on a home screen with a search box, the reader's saved lists and their recently read articles.
- It opens the same way with no network. Saved and recently read articles open as usual; anything else says it needs the network.

## Reading an article

- An article keeps Wikipedia's layout: lead section, infobox, headings, tables, images and references, in the homelab's fonts and colours, light or dark.
- Links to other articles open them in the app. A link to an article that is not on the device while offline says it needs the network.
- Links that leave the encyclopedia (external sites, the Wikipedia source page in the footer) open in the browser.
- Every article has a **Save** action that adds it to a list (see [Saved lists](saved-lists.md)).
- Opening an article adds it to the reader's recently read articles on that device.

## Search

- **Online:** as the reader types, the app suggests article titles. Submitting searches the full text of every article in the install and lists results with a short snippet.
- **Offline:** search covers only the device's saved and recently read articles, by title and text. The results say that the rest of Wikipedia can be searched when the device is back online.

## Recently read

- The home screen lists recently read articles, newest first.
- Recently read articles stay on the device until it needs room; the oldest go first. Saved articles never go to make room.
- The reader can clear their recently read list.
