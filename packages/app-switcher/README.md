# App switcher

The tab at the top of every app and the menu it opens: the person's name and email, Home, every app they have access to, Account settings and Sign out (`GLOSSARY.md`: **App switcher**). It is one standalone script that the [gateway](../gateway/README.md) puts inline into every page of every app, so no app installs it and updating the gateway updates it everywhere ([ADR-PLAT-004](../../docs/adr/ADR-PLAT-004-sign-in.md)).

## In an app

An app does nothing to get the switcher beyond its site in the gateway, and the switcher has no options: every app gets the same tab in the same place. It never changes the app's layout, since it floats over the page.

An offline-first app's saved page carries the switcher the gateway put in it, so the app shows the switcher from its last saved page, online too, until the app next updates that page. Nothing in the app's offline caching is needed for the switcher.

The switcher renders in its own shadow DOM, styled by a constructed style sheet, so the app's styles and its own don't reach each other and a page's style policy doesn't block it. The gateway lets its script, and its requests to Home and for icons, through a page's security policy.

On VoidAuth's pages (at `accounts.`) it also marks VoidAuth's "add a passkey?" question as skipped (`passkey_skipped` in `localStorage`), so it never comes; people add passkeys from Account settings. It asks Home for the person on load, and shows nothing when they turn out to be signed out: signing in is left to the app.

## What it shows

- The tab: a 16×16 chevron with 4px around it (24×24), hanging from the top centre of the screen over the page. It can be tapped a little beyond its edges. Tapping it, or Enter, Space or the arrow keys on it, pulls the menu down.
- The menu: the person's icon (the first letters of the first and last words of their name, or of their username, on a colour from `tokens.avatar` in `@homelab/theme` picked from the username alone), their name and email, then Home, then the person's other apps by name, with the app in use marked **Current**, then **Account settings**, VoidAuth's own pages for the person's name, email, password and passkeys, then **Sign out**, which goes to VoidAuth's sign-out page and so signs the homelab account out of every app.
- It closes on Escape, a click outside or Tab. The arrow keys, Home and End move through it.
- It follows the device's light or dark setting.

## Offline

The switcher keeps Home's last answer in the app's `localStorage` (`homelab.switcher`) and shows it when the device is offline or Home can't be reached. While the device is offline, apps whose manifest doesn't mark them as opening offline are greyed out and can't be opened, and Account settings and Sign out are greyed out with **Needs a connection**. It asks Home again on every load and when the device comes back online, so apps granted or removed meanwhile show up then. A signed-out answer clears what it kept.

With each answer from Home it also keeps the apps' icons (`homelab.switcher.icons`), drawn at 40 pixels as data addresses, and shows them with the kept answer. A signed-out answer clears them too. Icons load with CORS, which the gateway allows for `/icons/*`, so an error page is never kept as an icon.

## Building and testing

```sh
npx nx build app-switcher   # dist/switcher.js, which the gateway's image build makes for itself
npx nx test app-switcher    # initials and colours
npx nx e2e home-e2e         # the switcher in a real browser, through the gateway, online and off
```
