# Our own sign-in on Better Auth: findings

Run on 2026-10-23 against Better Auth **1.7.12** and `@better-auth/passkey` **1.7.12**, on Node 26 with SQLite (`node:sqlite`), behind Caddy **2.10.2**, with Chromium through Playwright. Evidence is the e2e suite in `e2e/tests/sign-in.spec.ts` (11 tests, all passing, under a minute) and the unit tests in `accounts/test/` (13 tests).

## Recommendation

**Replacing VoidAuth with our own accounts service is feasible, and smaller than it sounds.** Everything VoidAuth does for the homelab today worked in a real browser through the unchanged gateway: one sign-in for every app, refusal of apps the admin didn't grant, grants that change on the next request, one sign-out per device, invites, passkeys and an authenticator app. The service is about 700 lines, most of them pages and invites.

What to carry into the decision:

- **The gateway and the apps don't change.** `packages/gateway/signed-in.caddyfile` is used as it is; only its upstream moves. The apps read the same four `Remote-*` headers.
- **`Remote-User` becomes the account id instead of the VoidAuth username.** Apps that key people by it (Notes, Home) would see everyone as new. Fine before anyone relies on the data; otherwise a one-off mapping.
- **We own the security-sensitive parts around Better Auth**: invites, the forward-auth answer, the admin endpoints, and keeping Better Auth patched.
- **Still to build for real use**: an admin UI, account recovery, and the account settings VoidAuth has and this spike doesn't (below).

## 1. Email as the sign-in identifier

**Works, and simpler than usernames.** Better Auth's email and password sign-in is its default, so there is no placeholder email as in the Notes server spike (`spikes/notes-server-stack-poc/server/src/auth.ts`). Emails are stored lowercase. Public sign-up is off (`emailAndPassword.disableSignUp`, `public sign-up is closed` in the unit tests); invites create accounts through Better Auth's internal adapter instead.

The apps get the email in `Remote-Email`, and the account id in `Remote-User`, because a person may later change their email and apps key their data by `Remote-User`.

## 2. Sign in once, every app

**Works.** The session cookie is `__Secure-homelab.session_token` on the parent domain (`Domain=.home.test; HttpOnly; Secure`, from Better Auth's `crossSubDomainCookies`). The gateway asks `GET /api/authz/forward-auth` on every request to an app. A browser with no session is sent to `/sign-in?return-to=<the app's address>` and comes straight back after signing in. Opening a second app needs no sign-in (`one sign-in with email and password opens every app the admin granted`).

- The return address must be https on the homelab's domain, or the person lands on their account page, so the sign-in page is not an open redirect (`the sign-in page only sends people back to the homelab's own addresses`).
- **Speed:** a forward-auth answer takes about 1 ms in process (2,000 requests, SQLite, no cookie cache). Better Auth's cookie cache isn't needed, so revoking a grant or a session takes effect on the next request.
- A wrong password shows Better Auth's message on our page (`a wrong password is refused on the sign-in page`).

## 3. Each person gets only the apps they were granted

**Works, with the same naming as today.** The app is the subdomain (`notes.home.test` is `notes`). Being in `notes` or `notes-admins` lets a person in. Anyone else gets our own "You don't have access to notes" page as a 403 from the gateway, on the app's address, and nothing reaches the app (`a person without the app's groups gets our no-access page, and nothing reaches the app`).

- A hostname that isn't one app under the domain is refused, so a forgotten app fails closed.
- Taking an app away takes effect on the person's next request, without a sign-out (`taking an app away takes effect on the person's next request`).
- Groups are a comma-separated field on the user in this spike. For real use they would be their own table.
- Unlike VoidAuth, `auth_admins` doesn't open every app; it only allows inviting people and changing grants. Either is a one-line choice in `forward-auth.ts`.

## 4. Sign out once

**Works, for the whole device.** An app's "Sign out" is a plain link to `/sign-out`, which ends the session and shows the sign-in page. Every app in that browser, other open tabs included, goes to sign-in on its next load, and another browser signed in as the same person stays signed in (`one sign-out signs every app on the device out, and no other device`).

- There is no "Do you want to log out?" question, unlike VoidAuth. The trade-off: since it's a GET, another site could sign a person out. Making it a POST from a button in the App switcher closes that.

## 5. Forged headers and addresses

**Closed, by the existing gateway check.** A browser that sends its own `Remote-User`, `Remote-Email`, `Remote-Name` and `Remote-Groups` is still sent to sign in, and after signing in the app sees only the real values (`a person can't claim someone else's identity through the gateway`). The forward-auth answer always sends all four headers, so none of the browser's can survive.

Rate limiting keys on the address Caddy saw, not on an `X-Forwarded-For` the browser sends (`repeated sign-in attempts are limited per address, and a forged X-Forwarded-For doesn't help`). This relies on only the gateway reaching the accounts service, as with the apps.

## 6. Invites

**Works, and is our own code.** Better Auth has no invites, so `accounts/src/invites.ts` keeps them in a table of its own. An invite carries the groups the admin grants and, optionally, a fixed email. Following the link asks for a name, email and password, creates the account, signs the person in and shows their account page with their apps. A used or expired invite shows our "This invite can't be used" page (`an invite makes an account with the invite's apps, and works once`). Only a hash of the token is stored. Invites last a week.

On an empty install the service prints a first-run invite for the first admin, much as VoidAuth prints its first-run link.

## 7. Passkeys

**Works.** The account page's "Add a passkey" registers one (`@better-auth/passkey`, SimpleWebAuthn in the browser), and "Sign in with a passkey" then signs the person in with no email or password typed, and back to the app (`a passkey added on the account page signs the person in on its own`, with Chromium's virtual authenticator).

- The passkey's relying party is the parent domain (`rpID: home.test`), so a later ceremony on an app's own address could use the same credential.
- There's no prompt to add a passkey after a password sign-in. That's the VoidAuth page the gateway-injected switcher currently has to skip.

## 8. Authenticator app (TOTP)

**Works.** Turning it on asks for the password, shows the `otpauth://` URI and asks for one code before it takes effect. After that, the password alone sets no session cookie: our page asks for the code, and only then sends the person on (`with an authenticator app turned on, signing in needs its code`). A passkey sign-in doesn't ask for the code: Better Auth's two-factor step only follows a password sign-in (from its source, not tested).

Better Auth also makes backup codes when TOTP is turned on. The spike doesn't show them.

## 9. Fitting our UI

**Every page is ours.** Sign-in, account, invite, no-access and invalid-invite pages are plain server-rendered HTML in `accounts/src/pages.ts`. There's no loading screen, no language picker and no extra prompts, so nothing in the gateway or the switcher would need to patch them. Restyling them with the homelab theme is ordinary page work. The only third-party code in the browser is SimpleWebAuthn's bundle, for the passkey ceremonies. The pages follow the device's light or dark setting.

## 10. What we'd own

What VoidAuth gives us today that this spike doesn't build:

- **An admin UI**: listing people, inviting, changing grants, signing someone out of every device, deleting an account. The spike has JSON endpoints only.
- **Account recovery.** There's no email sending, so a forgotten password would be a reset link the admin makes, like an invite.
- **Account settings**: changing name, email and password, listing and removing passkeys, turning TOTP off, backup codes, and seeing signed-in devices. Better Auth has endpoints for all of these; they need pages.
- **Keeping Better Auth patched.** It had CVEs in 1.6.x in 2026 (`docs/research/build-own-sign-in.md`).

Smaller things seen along the way:

- Better Auth logs a "Database schema mismatch" error on every first start, before its migrations run. It's harmless but alarming in logs.
- The default sign-in rate limit is 3 attempts per 10 seconds per address; the spike sets it from the environment (`SIGN_IN_RATE_WINDOW`, `SIGN_IN_RATE_MAX`).
- Sessions last a year, with Better Auth extending them daily. Forward-auth requests extend the session in the database, but the gateway doesn't pass a refreshed cookie back to the browser, so the cookie keeps the lifetime it got at sign-in until the person next opens an accounts page. (Reasoned from Caddy's `forward_auth`, not tested.)

## Not tested

- Offline PWAs and WebSockets through the gateway. The gateway answers exactly as with VoidAuth (a redirect when signed out, the same headers when signed in), so the ProxyAuth spike's results (`spikes/voidauth-proxyauth-poc/FINDINGS.md`, sections 5 and 6) should carry over.
- Running the accounts service in a container, previews and the dev stack. It's a plain Node server with one SQLite file.
