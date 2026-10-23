# App switcher

The user icon at the top of every app and the menu it opens: the person's name and email, Home, every app they have access to, and Sign out (`GLOSSARY.md`: **App switcher**). It is one standalone script that the [gateway](../gateway/README.md) puts inline into every page of every app, so no app installs it and updating the gateway updates it everywhere ([ADR-PLAT-004](../../docs/adr/ADR-PLAT-004-sign-in.md)).

## In an app

An app does nothing to get the switcher beyond its site in the gateway. It draws itself in the `<homelab-switcher>` the app puts in its header, following the app's light or dark theme through the element's `theme` attribute:

```tsx
import type { SwitcherTheme } from "@homelab/app-switcher/react";

const theme: SwitcherTheme = useComputedColorScheme("light");
<homelab-switcher theme={theme} />;
```

An offline-first app also adds the switcher's route to its Workbox config, so the other apps' icons show when it opens offline:

```ts
import { switcherCaching } from "@homelab/app-switcher/caching";

VitePWA({
  workbox: { clientsClaim: true, runtimeCaching: switcherCaching /* … */ },
});
```

`clientsClaim` lets the service worker keep the icons on the very first visit. The app's saved page carries the switcher the gateway put in it, so an offline-first app shows the switcher from its last saved page, online too, until the app next updates that page.

The switcher renders in its own shadow DOM, so the app's styles and its own don't reach each other. It asks Home for the person on load, and shows nothing when they turn out to be signed out: signing in is left to the app.

## What it shows

- The user icon: the first letters of the first and last words of the person's name (or of their username, with no name), on a colour from `tokens.avatar` in `@homelab/theme`, picked from the username alone.
- The menu: the name and email, then Home, then the person's other apps by name, with the app in use marked **Current**, then **Account settings**, VoidAuth's own pages for the person's name, email, password and passkeys, then **Sign out**, which goes to VoidAuth's sign-out page and so signs the homelab account out of every app.
- It closes on Escape, a click outside or Tab. The arrow keys, Home and End move through it.

## Offline

The switcher keeps Home's last answer in the app's `localStorage` (`homelab.switcher`) and shows it when the device is offline or Home can't be reached. While the device is offline, apps whose manifest doesn't mark them as opening offline are greyed out and can't be opened, and Account settings and Sign out are greyed out with **Needs a connection**. It asks Home again on every load and when the device comes back online, so apps granted or removed meanwhile show up then. A signed-out answer clears what it kept.

The service-worker route in [`src/caching.ts`](src/caching.ts) keeps the other apps' icons (from the copy kept, refreshed in the background). Icons load with CORS, which the gateway allows for `/icons/*`, so an error page is never kept as an icon.

## Building and testing

```sh
npx nx build app-switcher   # dist/switcher.js, which the gateway's image build makes for itself
npx nx test app-switcher    # initials and colours
npx nx e2e home-e2e         # the switcher in a real browser, through the gateway, online and off
```
