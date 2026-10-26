# ADR-PLAT-009. How does an app plug into the homelab?

- Status: Accepted
- Date: 2026-10-26
- Depends on: [ADR-PLAT-002](ADR-PLAT-002-repo-structure.md), [ADR-PLAT-004](ADR-PLAT-004-sign-in.md)
- Dependency of: [ADR-NOTE-014](../../apps/notes/docs/adr/ADR-NOTE-014-http-and-accounts.md)

## Context

The homelab runs apps it builds, such as Notes and the Encyclopedia, and will run open-source apps it bundles, such as Vaultwarden, and apps other developers write. The platform around them ([ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)), the gateway, the accounts service, Home and the App switcher, has to sign people in to each app, list it on Home and in the switcher, and add the switcher to its pages, without an app depending on any of the platform's code. An app written in another language, or one the homelab cannot change, has to be able to follow the same rules. Without a written contract, each app reached into whatever platform detail it needed, such as the spelling of group names.

## Decision

- **The app contract** is what an app must provide and may rely on, as headers and files at known paths, so that an app in any language can follow it. It has five touch points:
  1. **Its own address.** An app serves its whole site at the root of its own address. The platform puts it on its own subdomain directly under the parent domain, and the subdomain is the app's id, the name App access gives it.
  2. **Its manifest and icons.** An app serves a web app manifest at `/manifest.webmanifest` and its icons under `/icons/`, both readable without signing in. Its manifest has `"homelab": { "opens_offline": true }` when the app opens offline.
  3. **Who is there.** Every request an app gets, WebSocket upgrades included, carries the person's account id (`Remote-User`), name (`Remote-Name`), email (`Remote-Email`) and their level in this app (`Remote-Groups`: `<app>` for a member, `<app>-admins` for an admin), with values that cannot go as raw headers percent-encoded ([ADR-PLAT-004](ADR-PLAT-004-sign-in.md)). An app keys a person's data by the account id, never the email, which can change. A TypeScript app may read the headers with `@homelab/identity`, which gives the person and their level in each app, member or admin; it is optional, and an app in another language reads the headers themselves. The accounts service writes the headers with the same library, so the format cannot drift between the two ends.
  4. **No signed-out requests.** A signed-out request never reaches an app. A page load is sent to sign in. A `fetch` from the app gets a redirect, which the app reads as "signed out" before doing a page load that its service worker leaves to the network, so that the browser reaches the sign-in page. An offline-first browser app may start through `@homelab/signed-in-state`, which asks the app's own "who is here" question, tells signed in, signed out and unreachable apart, and remembers the last person on the device.
  5. **The App switcher.** An app's HTML pages get the App switcher's script inline before `</body>` and its tab over the top centre of the page. The platform adds the script's hash to the page's security policy, so an app with a strict policy needs nothing for it.
- **The platform finds apps by reading their manifests**, for every app installed on the accounts service (`HOMELAB_APPS`). An app never registers itself.
- **A bundled app gets a per-app adapter in the platform** where it cannot meet a touch point itself, such as a manifest at another path mapped to `/manifest.webmanifest`. The bundled app stays unchanged.
- **Apps have no opinion on sign-in.** Whatever stands in front of an app says who is there, so an app works the same behind the real gateway and behind a stand-in in its tests.
- **The contract is enforced** by the boundary rule, under which an app cannot depend on a platform project ([ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)); by this ADR, which code review holds apps to; and by the libraries in `packages/` that our own apps use to follow it, such as `@homelab/identity`, which reads and writes the identity headers, and `@homelab/signed-in-state`, which reads the signed-out redirect.

## Alternatives considered

- **Apps register themselves with the platform** at start-up. A bundled app cannot call the homelab's code; an app's start would depend on the platform being up; and an installable app has a manifest anyway, which already holds its name and icons.
- **A black-box contract check**, a test suite run against any app's container. Deferred until apps the homelab does not write exist: today every app in the repo is checked by its own and the platform's end-to-end suites.
- **A contract version in the manifest.** Deferred with the black-box check, since only the homelab's own apps follow the contract so far.

## Evidence

- Notes and the Encyclopedia follow every touch point, with no import of a platform project: `npm run boundaries` passes, and fails for an app that imports one ([ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)).
- The platform's end-to-end suite (`platform/e2e/`) runs the real gateway, accounts service, Notes and the Encyclopedia in Chromium: each app shows on Home and in the switcher from its manifest alone, its pages get the switcher, and a stand-in bundled app with a strict security policy gets the switcher too. `platform/e2e/tests/notes.test.ts` opens Notes as an owner and as a member, with identity headers a browser sends ignored, and its sync socket upgraded with the person on it.
- Notes' end-to-end suite (`apps/notes/e2e/`) runs Notes behind a stand-in front door that writes the identity headers with `@homelab/identity` and redirects a signed-out browser to a stand-in sign-in page, with no Docker and nothing from `platform/`: Notes signs in, tells owners from members, signs out and starts offline the same as behind the real gateway (issue #126).
- `packages/identity/src/identity.test.ts` shows that what the accounts service writes is what an app reads back, names and emails needing percent-encoding and values containing `%` included, and that the headers are byte for byte what the accounts service sent before the library wrote them; the accounts service's forward-auth tests pin the same bytes.
- `packages/signed-in-state/src/signed-in-state.test.ts` shows an app's start-up with a fake question, fake device storage and fake device events: signed in, signed out leaving only once the app opens offline, unreachable with and without a remembered person, storage that throws, and checking again on reconnecting and on becoming visible. Notes and Home start through it.
- `platform/gateway/test/signed-in.test.ts` shows a manifest and icons readable signed out, and every other path sent to sign in; `platform/gateway/test/switcher.test.ts` shows pages getting the switcher's script inline.

## Consequences

- Adding an app means serving it to the contract, a site for it in the gateway that imports the sign-in check and the switcher, and its subdomain in `HOMELAB_APPS`. Nothing in the app depends on the platform's code, and nothing in Home changes.
- A change to any touch point is a change to every app, so it changes this ADR and every app in the same pull request.
- An app's tests can run it behind a stand-in that adds the identity headers, without the platform.
- The black-box check and a contract version are added once an app the homelab does not write is installed.
