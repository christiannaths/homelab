# App switcher

The user icon at the top of every app and the menu it opens: the person's name and email, Home, every app they have access to, and Sign out (`GLOSSARY.md`: **App switcher**). It is one standalone script that Home serves, so updating Home updates the switcher in every app ([ADR-PLAT-004](../../docs/adr/ADR-PLAT-004-sign-in.md)).

## Adding it to an app

One script tag, at the end of `<body>`:

```html
<script
  src="/_homelab/switcher.js"
  data-placement="element"
></script>
```

Every app's gateway site answers `/_homelab/switcher.js` (in [`signed-in.caddyfile`](../gateway/signed-in.caddyfile)) by sending the browser on to Home's copy, at `home.` beside the app.

| Option | On | Values |
| --- | --- | --- |
| `data-placement` | the script tag | `element`: inside the `<homelab-switcher>` the app puts in its header. Or a corner for a floating icon: `top-right` (also the default when the page has no `<homelab-switcher>`), `top-left`, `bottom-right`, `bottom-left` |
| `data-theme` | the script tag | `light` or `dark`. Without it, the switcher follows the device's setting |
| `theme` | `<homelab-switcher>` | `light` or `dark`, overriding the script tag's; set it from the app's current theme |

A React app imports the element's JSX type with the theme's, as Home does:

```tsx
import type { SwitcherTheme } from "@homelab/app-switcher/react";

const theme: SwitcherTheme = useComputedColorScheme("light");
<homelab-switcher theme={theme} />;
```

The switcher renders in its own shadow DOM, so the app's styles and its own don't reach each other. It asks Home for the person on load, and shows nothing when they turn out to be signed out: signing in is left to the app.

## What it shows

- The user icon: the first letters of the first and last words of the person's name (or of their username, with no name), on a colour from `tokens.avatar` in `@homelab/theme`, picked from the username alone.
- The menu: the name and email, then Home, then the person's other apps by name, with the app in use marked **Current**, then **Sign out**, which goes to VoidAuth's sign-out page and so signs the homelab account out of every app.
- It closes on Escape, a click outside or Tab. The arrow keys, Home and End move through it.

## Building and testing

```sh
npx nx build app-switcher   # dist/switcher.js, which Home's server serves
npx nx test app-switcher    # initials and colours
npx nx e2e home-e2e         # the switcher in a real browser, through the gateway
```
