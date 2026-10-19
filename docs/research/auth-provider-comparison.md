# VoidAuth vs Authelia vs Authentik

**Outcome (2026-10-19):** the VoidAuth ProxyAuth spike confirmed signing out once ([`spikes/voidauth-proxyauth-poc/FINDINGS.md`](../../spikes/voidauth-proxyauth-poc/FINDINGS.md)), so the homelab stays on VoidAuth, behind one gateway ([ADR-PLAT-004](../adr/ADR-PLAT-004-sign-in.md)).

Checked 2026-10-19 against the goal Christian set for homelab sign-in: it should work like a Google account.

## The goal

1. **One sign-in.** You sign in in one place, and every app you can use opens without asking again.
2. **Admin-granted access.** A homelab admin decides which apps each person gets.
3. **Sign out once.** Signing out anywhere signs you out of every app on that device.
4. **Invites.** Nobody can register on their own. The admin invites people.
5. **Admin UI.** The admin manages people in a web page, not in config files.
6. **Small and easy to install.** Anyone should be able to run it ("bring your own settings").

## Side by side

|  | VoidAuth | Authelia | Authentik |
| --- | --- | --- | --- |
| One sign-in | Yes | Yes | Yes |
| Admin-granted access per app | Yes. Groups decide which apps (OIDC clients) and which gateway-protected domains a person gets. | Yes, but only through `access_control` rules written in YAML. | Yes. Policies are bound to each application in the admin UI. |
| Sign out once on a device | Yes, for apps behind its gateway check (ProxyAuth), because every app shares the one VoidAuth session. **Not for OIDC apps**: its back-channel logout refuses private, loopback and CGNAT addresses (which is every homelab address), and its logout tokens carry no session id. _The spike is testing this._ | Yes, for apps behind its gateway check. OIDC back-channel and front-channel logout are on the roadmap but not built. | Yes, with OIDC back-channel and front-channel logout (single logout added in 2025.10). Its gateway check (proxy outposts) ends sessions only within one outpost. I haven't tested whether its back-channel accepts private addresses. |
| Invites, no self sign-up | Yes. The admin sends invite links. | No. Users live in a YAML file or LDAP. | Yes, through invitations and enrollment flows. _From documentation, not tested._ |
| Admin UI for people | Yes | No. The only option is a separate LDAP server with its own UI (LLDAP). | Yes, and it has the most features of the three. |
| Passkeys and two-factor | Passkeys and TOTP. MFA can be required per group, per app or per domain. | Passkeys, TOTP and Duo | Passkeys, TOTP, Duo and more |
| What it takes to run | One container, using SQLite or Postgres | One small container, plus LDAP if you want to manage people in a UI | Postgres, a server and a worker. Around 2 GB of RAM in practice. |
| Licence and maturity | AGPL-3.0 (_reported, not checked_). Young project with one main maintainer. | Apache-2.0. Mature and widely used. | MIT core with some enterprise-only features. Mature, company-backed. |

## What this means

- **Authelia is out.** It has no way to invite people and no admin page for them, and both are core to the homelab.
- **Authentik meets every goal today**, including sign-out once for OIDC apps. The cost is size: it needs Postgres, two services and about 2 GB of RAM, which is a lot to ask of someone installing a homelab.
- **VoidAuth meets every goal except sign-out once, and the gateway route (ProxyAuth) should close that gap.** Apps sit behind VoidAuth's check at the reverse proxy, so one VoidAuth session covers them all, and ending it signs the person out everywhere on that device. The VoidAuth ProxyAuth spike is confirming this in practice.

## Recommendation

Keep VoidAuth if the ProxyAuth spike confirms sign-out once. If it doesn't, move to Authentik, which already does it. Its back-channel logout would need a test on a private-network address before committing.

For offline-first apps, the gateway route is a good fit. The installed app opens from its own cache, so the gateway isn't involved offline. Once back online, the app's first request reaches the gateway, so a device that was signed out elsewhere goes straight to sign-in.
