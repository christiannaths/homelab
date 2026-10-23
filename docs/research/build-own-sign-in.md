# Building our own homelab sign-in

**Outcome (2026-10-19):** not needed for now. The ProxyAuth spike passed and the homelab stays on VoidAuth ([ADR-PLAT-004](../adr/ADR-PLAT-004-sign-in.md)). This stays the fallback.

**Update (2026-10-23):** option 2 was spiked, with email as the sign-in identifier, to bring the sign-in pages into the homelab's own UI. It worked behind the unchanged gateway; see [`spikes/better-auth-sign-in-poc/FINDINGS.md`](../../spikes/better-auth-sign-in-poc/FINDINGS.md). No decision yet.

This is light research from 2026-10-19, kept for the case where the VoidAuth ProxyAuth spike fails. See also [auth-provider-comparison.md](auth-provider-comparison.md).

## Why building it is easier than it sounds

VoidAuth, Authelia and Authentik have to work with any app, so they speak OIDC and send sign-out notices to apps they don't control. Every homelab app is ours, so a home-made sign-in can skip most of that:

- **One account service** holds the people, passwords, passkeys, invites and the admin's choice of which apps each person can use.
- **One session per browser.** Each app asks the account service "who is this, and may they use me?" (or the gateway asks for it). It does not keep a sign-in of its own.
- **Sign out once comes for free.** Ending that one session signs the browser out of every app, and no notices need to be sent.
- **Offline is unchanged.** Apps keep the person they last saw and check again when back online, exactly as Notes does now.

## Where the apps live

**Decided 2026-10-19 (Christian):** every homelab app is hosted under one domain. The other layouts below are out of scope.

A browser sends one shared session only to addresses that share a parent:

- **Works:** `notes.home.example` and `wiki.home.example` (with a cookie for `home.example`), or one host on different ports (_inferred: cookies ignore ports_).
- **Doesn't work as simply:** apps on unrelated names, such as separate Tailscale machine names. Each app would then need a short redirect round-trip to the account service, which is a small OIDC of our own.

## Three ways to do it

|  | What it is | What we'd own |
| --- | --- | --- |
| **1. Fix VoidAuth** | Upstream or fork two changes: allow sign-out notices to homelab addresses, and include the session id in them. | Two small patches, or a fork to maintain if upstream says no. |
| **2. Account service on Better Auth** | A small `apps/accounts` service built on Better Auth, which already has passwords, rate limiting, sessions, an admin plugin, passkeys (`@better-auth/passkey`) and two-factor. Invites would come from a community plugin or our own code. | The admin and invite UI, deciding which apps each person gets, account recovery, and keeping up with Better Auth's security fixes (it had CVEs in 1.6.x in 2026). |
| **3. From scratch** | Password hashing, passkeys (SimpleWebAuthn), TOTP and sessions, built on small libraries. | All of the above plus the security-sensitive core. Not recommended. |

Better Auth is already known here. Notes used it in a spike before VoidAuth replaced it (ADR-NOTE-014). Its rough edges were that every user needs an email address and that rate limiting needs the client's IP from the proxy (`apps/notes/docs/research/09-server-stack-spike-findings.md`). Its OIDC provider plugin is being replaced by an OAuth provider plugin, which would matter only for option 2 on unrelated names.

## Recommendation

If the spike fails, first offer VoidAuth the two patches (option 1), since that keeps a maintained product. If that is refused or stalls, build option 2 on Better Auth with one shared session.

## Sources

- Better Auth OIDC provider plugin: <https://better-auth.com/docs/plugins/oidc-provider>
- Better Auth OIDC provider, v1.6 docs (deprecation note): <https://better-auth.com/docs/1.6/plugins/oidc-provider>
- Community invite plugin: <https://www.mintlify.com/0-Sandy/better-auth-invite-plugin/introduction>
- CVE-2026-53514 (Better Auth oauth-provider and passkey, 1.6.x): <https://osv.dev/vulnerability/CVE-2026-53514>
