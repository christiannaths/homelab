# ADR-NOTE-009. How does an instance know who is editing?

- Status: Accepted
- Date: 2026-10-23
- Depends on: [ADR-NOTE-004](ADR-NOTE-004-hosting-and-scale.md), [ADR-NOTE-005](ADR-NOTE-005-document-persistence.md), [ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)
- Dependency of: [ADR-NOTE-001](ADR-NOTE-001-offline-use.md), [ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md), [ADR-NOTE-011](ADR-NOTE-011-access-control.md), [ADR-NOTE-013](ADR-NOTE-013-data-layout.md), [ADR-NOTE-014](ADR-NOTE-014-http-and-accounts.md)

## Context

Homelab apps share one account behind one gateway, with per-app App access ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)). Notes must work offline after sign-in ([ADR-NOTE-001](ADR-NOTE-001-offline-use.md)) and may be internet-reachable.

## Decision

- **The gateway signs people in.** Notes has no passwords, sign-in flow or sessions; every request carries the person in `Remote-*` headers.
- **Roles come from App access to Notes** (homelab admin gives nothing):

  | App access | `Remote-Groups` | Notes role             |
  | ---------- | --------------- | ---------------------- |
  | Member     | `notes`         | member                 |
  | Admin      | `notes-admins`  | owner                  |
  | None       | —               | refused by the gateway |

- **Notes keeps a people list** keyed by account id (`Remote-User`), added on first request; name and role refresh on every request.
- A new device needs server and accounts service once, then opens offline. Online starts and reconnects ask who's signed in before showing kept data.
- **No sign-out of its own:** the App switcher's Sign out covers every app and needs a connection. Data stays; the next online start forgets the person and goes to sign-in.

## Alternatives considered

- **OIDC client of VoidAuth** (PR #66): missed sign-outs elsewhere (back-channel logout refuses homelab addresses).
- **Better Auth passwords:** every app owns password security.

## Evidence

- ProxyAuth spike ([`spikes/voidauth-proxyauth-poc/FINDINGS.md`](../../../../spikes/voidauth-proxyauth-poc/FINDINGS.md), PR #68) → header identity, group levels, one sign-out across apps.
- `apps/notes/e2e/` (stand-in front door via `@homelab/identity`, #126) → roles by account id, sync only signed in, sign-out reaches open tabs, offline start.
- `platform/e2e/` (`notes.test.ts`, real gateway) → roles by account id, browser identity headers ignored, no-access page, Notes' Sign out signs out Home and the Encyclopedia.

## Consequences

- Account ids never change: new email or name = same person; re-invited = new person.
- Removing access stops the next request, sync included; offline devices keep data until online.
- An open sync socket survives a sign-out elsewhere (gateway checks only on open) until reconnect or the next session check.
- Workspace membership comes with access ([ADR-NOTE-011](ADR-NOTE-011-access-control.md)); sync reads the person per connection ([ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md)).
- Passwords and sign-in rate limiting belong to the accounts service.

## Changelog

- 2026-10-23: Keyed by account id from the homelab accounts service (replacing VoidAuth usernames); only admin-level App access makes an owner ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md), issue #111, spec #110).
- 2026-10-22: Removed Notes' own sign-out and `/api/sign-out` for the App switcher's (issue #89, spec #75).
- 2026-10-19: Person from gateway headers instead of OIDC sessions, which missed sign-outs elsewhere ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md), PR #68).
- 2026-10-17: VoidAuth sign-in with year-long device sessions instead of own passwords ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)).
- 2026-10-16: Accepted. Own `scrypt` password accounts, admin-created, long-lived sessions.
