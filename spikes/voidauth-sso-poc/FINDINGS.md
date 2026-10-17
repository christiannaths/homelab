# VoidAuth spike: findings

Spike for [issue #35](https://github.com/christiannaths/homelab/issues/35), run on 2026-10-17 against VoidAuth **1.16.0** (`voidauth/voidauth:1.16.0@sha256:189ef16f…`), the official image, unmodified, on SQLite, with Docker 29.8 and Compose 5.6. Evidence is the e2e suite in `e2e/tests/` (33 tests, all passing, about a minute) and VoidAuth's source at the [v1.16.0 tag](https://github.com/voidauth/voidauth/tree/v1.16.0), read outside this repo. Source links below point there; none of its code is copied here.

## Recommendation

**Adopt VoidAuth.** Neither of the two risky questions fails outright; each has a workaround that fits what was already decided.

- **Spotting the instance admin works as-is** (question 2).
- **Invites have no limited API** (question 1). VoidAuth's admin API takes only a full admin's session cookie, so an app that can invite can also delete users. The workaround with the least risk: turn on VoidAuth's open sign-up and let each app keep its own one-time invite links. A VoidAuth account then grants nothing by itself, which is already the decided model. No app holds admin credentials. The cost is that the "owners create the invite through the accounts system" step goes away: the invitee creates their own account during sign-in. The alternative that keeps that step needs VoidAuth admin credentials somewhere. If that matters, put them in one small invite service in front of VoidAuth, never in each app.
- **Two settings matter in production:** set `TRUSTED_PROXIES` to the reverse proxy's address, and don't publish VoidAuth's port (question 8). Expect about 300–400 MB of memory (question 6).

## 1. Apps creating invites

**There is no invite API an app can be given on its own.** VoidAuth has no API tokens. Its whole admin API, invitations included, sits behind `adminRouter.use(checkCanLogin, checkAdmin)` ([`server/routes/admin.ts:54`](https://github.com/voidauth/voidauth/blob/v1.16.0/server/routes/admin.ts#L54)): a VoidAuth session cookie whose user is in `auth_admins`. Tested in `invites.test.ts`:

- With an admin session, `POST /api/admin/invitation` with an email creates a one-time link (`/invite?invite=<id>&challenge=<secret>`), with no admin screens. `server/src/voidauth-admin.ts` gets the session by signing in the way VoidAuth's web UI does. The invitee accepts it, comes back already signed in to VoidAuth, and the app lets them in because their email arrives with `email_verified: true`. The link works once.
- No cookie: 401. The app's own OIDC access token as a `Bearer`: 401. A non-admin's session: 403.
- The same admin session can `DELETE /api/admin/user/:id`. Nothing narrower than "admin" exists.

**Workaround, tested:** `SIGNUP=true`, `SIGNUP_REQUIRES_APPROVAL=false`. The app makes its own one-time link (`/join/<token>`). The invitee opens it, the app sends them to VoidAuth, they create an account on VoidAuth's sign-in page (or sign in if they have one), and VoidAuth's flow carries straight on to the app, which uses up the link and adds them. Tests show:

- Someone who has an account but no invite is turned away by the app (403).
- A self-registered email is **unverified** when there is no email server, so the app must not match people to invites by email. It matches by the link and records VoidAuth's `sub`.
- A catch: anyone who can reach VoidAuth can register any email address first ("squatting"). That then blocks a VoidAuth invite for that email ("Email taken.", 409) until the admin fixes it. With app links this doesn't matter, because email isn't used to match.
- With open sign-up, a used VoidAuth invite link doesn't fail: it becomes an ordinary sign-up without the invite's verified email.

## 2. Spotting the instance admin

**Yes.** With the `groups` scope, the ID token and userinfo both carry `groups: ["auth_admins"]` for VoidAuth admins and `groups: []` for everyone else ([`server/db/user.ts:227`](https://github.com/voidauth/voidauth/blob/v1.16.0/server/db/user.ts#L227)). The stand-in app makes the first `auth_admins` member to sign in its first owner, and nobody after that (`access.ts`, unit tested; e2e in `claims.test.ts`). Without the `groups` scope there is no `groups` claim. Note that `auth_admins` members also skip any group restriction on an OIDC app.

## 3. Sign-in basics

- **Email sign-in: yes.** The sign-in box takes a username or an email (tested). But VoidAuth always has a username as well (`[A-Za-z0-9_]{1,32}`): the person picks one when registering, unless an invite sets it.
- **Minimum password length of 8: no such setting.** VoidAuth only has `PASSWORD_STRENGTH`, a zxcvbn score from 0 to 4 (default 3). Tested by trying passwords (`claims.test.ts`, plus probing levels 0–3):
  - At 3: `Password123!`, `qwertyuiop` and the random `k7Rp2wXq` are refused; `violet quartz` is accepted.
  - At 1 or 2: a 6-character random password passes at 1, and 8 random characters pass at 2.
  - `PASSWORD_STRENGTH=0` is silently ignored and becomes 3, because the parser only accepts positive numbers ([`server/util/config.ts:353`](https://github.com/voidauth/voidauth/blob/v1.16.0/server/util/config.ts#L353)).
  - The closest to "8 or more" is the default of 3, which is stricter.
- **Display name: yes, one `name` claim** (profile scope), separate from `preferred_username` (the username). It is `null` if the person never set one. There is no `given_name` or `family_name`.

## 4. First run and recovery

- **First run:** on an empty database the log prints `Password reset link for the initial admin user, valid for 1 day:` and a `/reset_password?id=…&challenge=…` link for user `auth_admin`. Setting a password through it works once. The e2e global setup does exactly this.
- **Reset from the command line:** `docker compose run --rm voidauth user password-reset auth_admin` prints a new reset link, and it works. So does `docker compose exec -T voidauth node ./dist/index.mjs user password-reset auth_admin` in the running container. The image has no shell, so `exec` needs the full `node` command. A reset ends that person's existing VoidAuth sessions (tested).

## 5. Notes' session on top

**Works, and the app keeps working with VoidAuth stopped.** `server/src/app.ts` does the authorization-code flow with PKCE, checks the ID token with `jose`, and then sets its own `notes_device` cookie (`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`). The `/sync` WebSocket accepts that cookie and refuses a connection without it (401). The 30-day idle limit and renew-on-sync are unit tested with a fake clock (`devices.test.ts`).

In `device-session.test.ts`, with VoidAuth stopped (`docker compose stop`), the signed-in person's `/api/me` and WebSocket sync keep working, and a new sign-in fails. After a restart, people sign in again without a password, because VoidAuth's own sessions (1 year with "remember", [`shared/constants.ts`](https://github.com/voidauth/voidauth/blob/v1.16.0/shared/constants.ts)) survive the restart.

Not tested: a real browser, or the `Secure` cookie over real HTTPS. The tests run over plain http on localhost, where Node's client sends `Secure` cookies anyway.

## 6. Running cost

- **Memory:** `docker stats` showed 285 MiB just after start and 404 MiB after the full suite (about 60 accounts created, each password hashed with argon2). It stayed at 404 MiB after a minute idle.
- **Image:** 278 MB on disk (55 MB download), for amd64 and arm64. It runs Node 24 inside and has no shell.
- **Compose needs:**
  - Required: `APP_URL` (the public https URL) and `STORAGE_KEY` (32+ random characters; keep it, it encrypts secrets at rest).
  - Settings used here: `DB_ADAPTER: sqlite`, `DEFAULT_REDIRECT`, `SIGNUP` and `SIGNUP_REQUIRES_APPROVAL` for the workaround, and `TRUSTED_PROXIES` (question 8).
  - Volumes: `/app/config` (branding, email templates) and `/app/db` (`db.sqlite`).
  - Apps can be declared as `OIDC_<id>_CLIENT_*` variables instead of through the admin screens, as `compose.yml` does for Notes.
- **HTTPS:** VoidAuth has no TLS of its own; it expects a reverse proxy to provide it. **Not tested here:** behind a real HTTPS proxy.
- The container runs as root.

## 7. Theming (light and dark)

**Both modes exist.** The UI follows the system setting by default, and a header toggle offers System, Light or Dark, remembered in the browser. The generated theme uses CSS `color-scheme: light dark` and `light-dark(…)` colors (checked on the running container in `running-cost.test.ts`). The options:

- `APP_COLOR`: one theme color, from which a full Material 3 palette is generated for both modes.
- `APP_TITLE` and `APP_FONT`.
- Your own `logo`, `favicon` and `apple-touch-icon` in `/app/config/branding`.
- A `custom.css` there, loaded after the theme. It can override any `--mat-sys-*` variable, per mode with `light-dark()`.
- Email templates in `/app/config`.

There's enough to remove VoidAuth's branding, but the layout itself is fixed.

## 8. Rate limiting behind a proxy

VoidAuth limits every POST, PUT, PATCH and DELETE (sign-in attempts included) to `API_RATELIMIT` per minute (default 60) per address ([`server/cli/server.ts:88`](https://github.com/voidauth/voidauth/blob/v1.16.0/server/cli/server.ts#L88)). It reads the address through Express's `trust proxy`, using `TRUSTED_PROXIES`, whose default is `loopback, linklocal, uniquelocal`: every private address. `rate-limit.test.ts` runs a second VoidAuth on host networking, allowing 5 a minute, and a small proxy in the test. The proxy and each client connect from their own 127.0.0.x address, so VoidAuth sees real, distinct addresses.

- **A proxy that doesn't pass on the client's address puts everyone in one bucket:** after one person's 5 failed attempts, a different person through the same proxy gets 429.
- **A proxy that appends `X-Forwarded-For`** (like nginx's `$proxy_add_x_forwarded_for`) keeps people apart: one is limited, the other isn't.
- **With the default `TRUSTED_PROXIES`, a client on a trusted address can forge its address and is never limited**, through the proxy or straight to VoidAuth. VoidAuth trusts the client's own address as a "proxy", so it reads the forged address to its left. Every device on a home network (192.168.x.x) counts as trusted this way. So if VoidAuth's port is reachable on the network, password guessing is effectively unlimited.
- **With `TRUSTED_PROXIES` set to the proxy's address only**, forging is ignored, both through the proxy and when going around it.

For the homelab: set `TRUSTED_PROXIES` to the reverse proxy's address, don't publish VoidAuth's port (only the proxy should reach it), and make sure the proxy passes on the client's address. Even then the limit is per address: a household behind one public address shares one bucket, and an attacker can lock that bucket out for a minute. It also counts the app servers' own token requests (one per sign-in). **Not tested:** Caddy, Traefik or nginx themselves; only a proxy that behaves like them.

## What this spike did not test

- A real browser, including the passkey and MFA flows.
- Real HTTPS and a real reverse proxy (see questions 5, 6 and 8).
- Postgres.
- Email (no SMTP was configured).
- Upgrading VoidAuth across versions.
