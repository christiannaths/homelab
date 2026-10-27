# Notes end-to-end tests

Real Notes server and web client in Chromium, seeing the homelab only through the [app contract](../../../docs/adr/ADR-PLAT-009-app-contract.md). No Docker; free ports only.

```sh
npx nx e2e notes-e2e
```

Builds the web client first (the service worker is production-only). Uses Playwright's Chromium (`npx playwright install chromium`) or `PLAYWRIGHT_CHROMIUM_PATH`.

## The stand-in front door

[`tests/front-door.ts`](tests/front-door.ts) fakes the gateway + accounts service, and only what Notes relies on:

| Case | Stand-in |
| --- | --- |
| Signed in | Test person's identity headers (via `@homelab/identity`) on every request incl. WebSocket upgrades; browser-sent ones dropped |
| Signed out | Redirect to a stand-in sign-in page (one button per person), then back; a `fetch` gets the same redirect |
| Manifest | It and `/icons/` readable signed out |
| Sign out | Tests delete the session cookie |
| Offline | Front door stops too (Playwright's offline mode lets service workers through) |

Notes runs at `http://notes.localhost:<port>` (a secure context, so no certificate needed); sign-in is the same host, another port, so the cookie reaches Notes but its service worker doesn't.

Real gateway and accounts service: [`platform/e2e`](../../../platform/e2e) (`tests/notes.test.ts`). Sign-in changes are tested there and can't break this suite.
