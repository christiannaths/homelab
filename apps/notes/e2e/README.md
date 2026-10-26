# Notes end-to-end tests

The real Notes server and web client in Chromium, as Notes knows the homelab: through the [app contract](../../../docs/adr/ADR-PLAT-009-app-contract.md) alone.

```sh
npx nx e2e notes-e2e
```

Nx builds the web client first, since the service worker exists only in its production build. The suite drives Playwright's Chromium (`npx playwright install chromium`), or the one at `PLAYWRIGHT_CHROMIUM_PATH`. It needs no Docker and listens only on free ports.

## The stand-in front door

[`tests/front-door.ts`](tests/front-door.ts) stands in for the platform: the gateway and the accounts service. It is what Notes relies on from them, and nothing more:

- A browser signed in as a test person gets that person's identity headers on every request to Notes, WebSocket upgrades included, written with `@homelab/identity`. Identity headers the browser sent are dropped.
- A signed-out browser is redirected to a stand-in sign-in page, which offers a button for each test person, and comes back to the page it asked for. A `fetch` from Notes gets the same redirect, which Notes reads as "signed out".
- The manifest and `/icons/` are readable signed out.
- Signing out anywhere is the session cookie going, which the tests do by deleting it.
- Going offline stops the front door as well as turning on Playwright's offline mode, which still lets service workers through to the network.

Notes is served at `http://notes.localhost:<port>`, which Chromium treats as a secure context, so the service worker registers without a certificate. The sign-in page is on the same host at another port, so its cookie reaches Notes while Notes' service worker stays off it.

## Where the real platform is tested

The platform's suite, [`platform/e2e`](../../../platform/e2e), opens Notes through the real gateway and accounts service: as an owner and as a member, with forged identity headers ignored and sync only while signed in (`tests/notes.test.ts`), and with the sign-in page, the no-access page, the App switcher and its Sign out. A change to sign-in belongs there, and can't break this suite.
