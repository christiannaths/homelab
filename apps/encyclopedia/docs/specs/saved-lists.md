# Saved lists

- Status: Draft
- Decisions: [ADR-ENCY-004](../adr/ADR-ENCY-004-identity.md) (lists belong to a person), [ADR-ENCY-005](../adr/ADR-ENCY-005-offline-use.md) (saved articles offline and across updates).

A reader saves articles into named lists, such as "Trip to Japan" or "Read later". Saving an article is also how a reader takes it offline.

## Lists

- A reader can create, rename and delete lists.
- One article can be on several lists.
- Lists are **private to their owner**: nobody else on the install sees them. Sharing lists may come later.
- Lists follow the reader's homelab account, so they appear on every device they sign in on.
- A reader can change lists offline. The changes reach their other devices when the device is next online.

## Saving

- The **Save** action on an article shows the reader's lists with a checkbox each, and lets them create a new list on the spot.
- Removing an article from its last list makes it a recently read article on that device, cleared like any other when the device needs room.

## Saved articles on the device

- Every saved article is kept on each of the reader's devices, images included, so it opens offline.
- The app asks the browser to keep its data, so the device does not clear saved articles on its own.

## After a content update

- When the install's content is updated ([Content and updates](content-and-updates.md)), saved articles refresh to the new version on each device the next time it is online.
- When a saved article was **renamed** in the new file and the app can follow the rename, the list shows it under its new name.
- When a saved article was **deleted**, or renamed in a way the app cannot follow, the device keeps the old copy and the list marks it "No longer in the current Wikipedia". The reader can still open that copy or remove it.
