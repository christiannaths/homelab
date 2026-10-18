# Content and updates

- Status: Draft
- Decisions: [ADR-ENCY-001](../adr/ADR-ENCY-001-content-source.md) (content source), [ADR-ENCY-003](../adr/ADR-ENCY-003-licensing.md) (licences), [ADR-ENCY-004](../adr/ADR-ENCY-004-identity.md) (only the homelab admin changes content).

## A new install

- A new install starts with a small starter Wikipedia, such as the most-read articles, so readers can use the app at once.
- The first time the homelab admin opens Encyclopedia, the app asks them to choose the full content, and shows the starter is in use until it arrives.

## Choosing content

The homelab admin chooses in Encyclopedia's settings screen. Readers do not see this screen.

- **Language:** one per install.
- **Size**, with the download size shown for each:
  - everything, with images
  - every article, no images (much smaller; also avoids image licensing questions)
  - introductions only
  - a topic subset, such as medicine, where Kiwix offers one
- The app downloads the choice in the background and shows progress. Readers keep using the current content meanwhile.
- When the download is complete and checked, the app switches to it. Readers' saved articles refresh as described in [Saved lists](saved-lists.md).
- Changing the choice later works the same way. The settings screen warns before a choice that would remove many readers' saved articles, such as switching language.

## Monthly updates

- Each month, the app checks for a newer version of the same choice, downloads it in the background and switches when it is complete.
- The settings screen shows the current content's date, the last check, and any update in progress.
- If a download fails, the app keeps the current content and tries again later. The settings screen says what failed.
- The server needs room for two files during an update. If there is not enough space, the app does not start the download and says how much room it needs.

## About and licences

Every reader can open an **About and licences** page, linked from the app's menu. It says:

- the content comes from Wikipedia, under CC BY-SA 4.0, with a link to the licence;
- images have their own licences, shown on each image's page on Wikipedia;
- the article styling has been changed to match the homelab;
- "Wikipedia is a trademark of the Wikimedia Foundation. This project is not affiliated with or endorsed by it.";
- Encyclopedia itself is free software under the GPLv3, with a link to its source;
- the content's language, size and date.
