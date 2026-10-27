# ADR-PLAT-009. How does an app plug into the homelab?

- Status: Accepted
- Date: 2026-10-26
- Depends on: [ADR-PLAT-002](ADR-PLAT-002-repo-structure.md), [ADR-PLAT-004](ADR-PLAT-004-sign-in.md)
- Dependency of: [ADR-NOTE-014](../../apps/notes/docs/adr/ADR-NOTE-014-http-and-accounts.md)

## Context

The platform ([ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)) signs people in to apps, lists them and injects the App switcher. Apps include ones we can't change (bundled FOSS) or that aren't TypeScript, so the seam can't be our code.

## Decision

The **app contract**: headers and files at known paths. An app depends on nothing else.

| # | Touch point | The app… | The platform… |
| --- | --- | --- | --- |
| 1 | Address | serves its whole site at `/` | puts it on `<app-id>.<parent>` |
| 2 | Manifest | serves `/manifest.webmanifest` and `/icons/`, public; `"homelab": {"opens_offline": true}` if it opens offline | reads it for the app's name and icon |
| 3 | Identity | keys data by `Remote-User`, never email | sends `Remote-User`, `Remote-Name`, `Remote-Email`, `Remote-Groups` (`<app>` member, `<app>-admins` admin), percent-encoded, on every request incl. WebSocket upgrades ([ADR-PLAT-004](ADR-PLAT-004-sign-in.md)) |
| 4 | Signed out | treats a `fetch` redirect as signed out, then does a page load | never forwards a signed-out request; redirects to sign-in |
| 5 | Switcher | nothing | injects the script before `</body>` and adds its hash to the CSP |

- Discovery: the platform reads manifests of apps in `HOMELAB_APPS`. Apps never register.
- Bundled apps: a per-app adapter in the platform covers any touch point they miss (e.g. a manifest at another path).
- Apps have no sign-in opinion; whatever is in front supplies identity.
- Optional TS helpers: `@homelab/identity` (touch point 3, both ends), `@homelab/signed-in-state` (touch point 4, offline-first start-up).
- Enforced by: `npm run boundaries` (app ↛ platform), this ADR in review, the helpers.

## Alternatives considered

- **Self-registration**: bundled apps can't call our code; start-up would depend on the platform; the manifest already has name and icons.
- **Black-box contract check / contract version**: deferred until an app we don't write exists.

## Evidence

- `npm run boundaries` fails for an app importing a platform project ([ADR-PLAT-002](ADR-PLAT-002-repo-structure.md)).
- `platform/e2e/`: real gateway, accounts, Notes, Encyclopedia; apps listed from manifests alone; switcher injected, incl. a strict-CSP stand-in; `notes.test.ts` opens Notes as owner and member, forged headers ignored.
- `apps/notes/e2e/`: Notes behind a stand-in front door, no Docker, nothing from `platform/` (#126).
- `packages/identity/src/identity.test.ts`: write → read round trips; wire bytes unchanged.
- `packages/signed-in-state/src/signed-in-state.test.ts`: signed in / out / unreachable, throwing storage, re-checks.
- `platform/gateway/test/`: manifest and icons public; switcher inlined.

## Consequences

- New app = serve the contract + a gateway site + add it to `HOMELAB_APPS`. No other app changes.
- Changing a touch point changes this ADR and every app in one PR.
- App tests can run behind a stand-in, without the platform.
