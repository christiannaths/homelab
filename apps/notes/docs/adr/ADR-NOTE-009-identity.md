# ADR-NOTE-009. How does an instance know who is editing?

- Status: Accepted
- Date: 2026-10-23
- Depends on: [ADR-NOTE-004](ADR-NOTE-004-hosting-and-scale.md), [ADR-NOTE-005](ADR-NOTE-005-document-persistence.md), [ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)
- Dependency of: [ADR-NOTE-001](ADR-NOTE-001-offline-use.md), [ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md), [ADR-NOTE-011](ADR-NOTE-011-access-control.md), [ADR-NOTE-013](ADR-NOTE-013-data-layout.md), [ADR-NOTE-014](ADR-NOTE-014-http-and-accounts.md)

## Context

Homelab apps share one account behind one gateway, with per-app App access granted by a homelab admin ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)). Notes must work offline after sign-in ([ADR-NOTE-001](ADR-NOTE-001-offline-use.md)) and may be internet-reachable.

## Decision

- **Sign-in is the gateway's** ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)). Notes has no passwords, sign-in flow or sessions; every request carries the person in `Remote-*` headers.
- **Roles come from App access to Notes:**

  | App access | `Remote-Groups` | Notes role             |
  | ---------- | --------------- | ---------------------- |
  | Member     | `notes`         | member                 |
  | Admin      | `notes-admins`  | owner                  |
  | None       | —               | refused by the gateway |

  Homelab admin gives nothing in Notes.

- **Notes keeps its own people list**, keyed by account id (`Remote-User`), added on first request; name and role follow the accounts service on every request.
- A new device needs server and accounts service once, then opens offline. Starting online or reconnecting, it asks the server who's signed in before showing kept data.
- **No sign-out of its own:** the App switcher's Sign out signs the browser out of every app ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)); needs a connection. Data stays ([ADR-NOTE-001](ADR-NOTE-001-offline-use.md)); the next online start forgets the person and goes to sign-in.

## Alternatives considered

- **OIDC client of VoidAuth with year-long device sessions** (PR #66): couldn't learn of sign-outs elsewhere, as VoidAuth's back-channel logout refuses homelab addresses.
- **Local passwords on Better Auth:** every app owns password security; one password per app.

## Evidence

- ProxyAuth spike ([`spikes/voidauth-proxyauth-poc/FINDINGS.md`](../../../../spikes/voidauth-proxyauth-poc/FINDINGS.md), PR #68) → header identity, `notes`/`notes-admins` levels, one sign-out for Notes and the Encyclopedia.
- `apps/notes/e2e/` (stand-in front door using `@homelab/identity`, #126) → sign-in, roles by account id, sync only while signed in, sign-out elsewhere reaches open tabs, offline start.
- `platform/e2e/` (real gateway and accounts) → `notes.test.ts` roles by account id, browser identity headers ignored, sync only signed in; no-access page; Notes' Sign out signs out Home and the Encyclopedia.

## Consequences

- Account ids never change: new email or name = same person; removed and re-invited = new person.
- Removing access stops the next request, sync included; an offline device keeps data until next online.
- Offline after a sign-out, a device shows what it kept until next online.
- An open sync socket survives a sign-out elsewhere (the gateway checks only on open) until reconnect or the next "who's signed in" check.
- Workspace members of their own come with access ([ADR-NOTE-011](ADR-NOTE-011-access-control.md)); sync reads the person per connection ([ADR-NOTE-010](ADR-NOTE-010-sync-and-access-checks.md)).
- Passwords and sign-in rate limiting belong to the accounts service.

## Changelog

- 2026-10-23: Keyed by account id from the homelab accounts service (replacing VoidAuth usernames); only admin-level App access makes an owner, not homelab admin ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md), issue #111, spec #110).
- 2026-10-22: Removed Notes' Sign out button, offline sign-out and `/api/sign-out`; one App switcher sign-out in every app (issue #89, spec #75).
- 2026-10-19: Person read from gateway headers, roles from VoidAuth groups, instead of OIDC client sessions admitting only the first VoidAuth admin, which missed sign-outs elsewhere ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md), PR #68).
- 2026-10-17: Sign-in through VoidAuth instead of Notes' own passwords; per-device year-long sessions extended on use; homelab moved to one invite-only sign-in ([ADR-PLAT-004](../../../../docs/adr/ADR-PLAT-004-sign-in.md)).
- 2026-10-16: Accepted. Own username/password accounts (`scrypt`), admin-created, long-lived device sessions.
