# App switcher

The tab atop every app and its menu ([`GLOSSARY.md`](../../GLOSSARY.md)). One script the [gateway](../gateway/README.md) inlines into every page, so apps install nothing and a gateway update updates it everywhere ([ADR-PLAT-004](../../docs/adr/ADR-PLAT-004-sign-in.md)).

## In an app

- Nothing to do, no options; floats over the page.
- An offline-first app shows the switcher saved in its cached page until it next updates that page; no app caching needed.
- Shadow DOM + constructed style sheet: no style leaks either way; page style policies don't block it. The gateway adds its script, accounts-site requests and icons to the page's CSP.
- On load asks the accounts site's [`/api/me`](../accounts/README.md); signed out → shows nothing (sign-in is the app's job).

## What it shows

- **Tab:** 16×16 chevron, 24×24 with padding, top centre; hit area a bit larger. Tap, Enter, Space or arrows open it.
- **Menu:** avatar (initials of first and last name words, or email; `tokens.avatar` colour from `@homelab/theme` picked by account id), name, email → apps by name, current one marked **Current** → **Account settings** (account page) → **Sign out**.
- **Sign out:** posts to the accounts site's `/sign-out` (signs this browser out of every app), then the sign-in page, which returns to the same page. If the accounts site doesn't answer, still signed in and the button says so. No confirm step; one would go before the post.
- **Keys:** Escape, outside click or Tab close; arrows, Home, End move.
- Follows the device's light/dark setting.

## Offline

| What | How |
| --- | --- |
| Last answer | `localStorage` `homelab.switcher`; shown offline or when the accounts site is unreachable |
| Icons | `homelab.switcher.icons`, 40px data URLs; fetched with CORS (gateway allows `/icons/*`) so error pages aren't kept |
| Offline state | Apps not marked opens-offline, Account settings and Sign out greyed (**Needs a connection**) |
| Refresh | Every load and on reconnect |
| Signed-out answer | Clears both |
| Session | Each signed-in answer → post to `/session`, which extends it and refreshes the cookie daily (the gateway's check can't) |

## Building and testing

```sh
npx nx build app-switcher   # dist/switcher.js, which the gateway's image build makes for itself
npx nx test app-switcher    # initials and colours
npx nx e2e platform-e2e         # the switcher in a real browser, through the gateway, online and off
```
