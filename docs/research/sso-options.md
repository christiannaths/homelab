# Sign-in across apps (SSO): build on `oidc-provider` or adopt an identity provider

Research date: 2026-10-17. Feeds the "Sign-in across apps (SSO)" row of `docs/adr/README.md` ("Not decided yet"), which names two options: build an `accounts` app on `oidc-provider`, or adopt Authelia.

## Method and limits

- **Sources.** Network policy blocked every project website (authelia.com, goauthentik.io, pocket-id.org, kanidm.github.io, zitadel.com, keycloak.org, sebadob.github.io). The GitHub API was blocked for these repos. Plain `git clone` and `raw.githubusercontent.com` worked, so every fact marked as checked comes from each project's **own docs source, config templates or code at `main`/HEAD on 2026-10-17**, plus the npm registry for `oidc-provider`.
- **Versions** come from `git ls-remote --tags`. **Activity** comes from commits on the default branch since 2025-10-01.
- Anything marked **(unverified)** is from prior knowledge and was not confirmed against a primary source in this session. Memory figures are documented values where cited; the rest are rough, typical figures **(unverified)**.
- No candidate was run. A short `docker run` spike would settle the unverified rows.

## Our requirements (R1 to R9)

| # | Requirement |
|---|---|
| R1 | One small container, SQLite or file storage, minimal moving parts |
| R2 | Sign in with **email** + password; password at least 8 characters, no composition rules |
| R3 | The server never needs SMTP for any flow (invites, resets) |
| R4 | First-run claim protection: a one-time setup code in the log, or equivalent |
| R5 | Per-account **slowdown** after 5 failed passwords, **no lockout** |
| R6 | The admin creates or invites people in a UI (no public sign-up) and can reset a password |
| R7 | If the only admin forgets their password, a server-side command prints a temporary password |
| R8 | A display name separate from email |
| R9 | OIDC provider that apps such as Notes use to sign in |

## Candidates in detail

### Authelia (v4.39.28, Apache-2.0, Go)
- **Users:** come from a YAML/TOML/JSON **file** (`authentication_backend.file`) or from LDAP. The file holds `displayname`, `email`, `disabled` and an argon2id hash, so R8 is met. Authelia rewrites the file itself when a user resets their own password.
- **Email login:** `search.email: true` lets people log in with email instead of username. The docs label this option "experimental".
- **No admin UI for users.** The roadmap entry "Dashboard / Control Panel and CLI for Admins" puts session management and OIDC client management in **v4.40.0**, which is not released (the latest tag is v4.39.28). **User Management** has no version assigned. Today an admin adds or resets a user by editing the file and running `authelia crypto hash generate`, so **R6 fails**.
- **Notifications:** exactly one notifier is required, either `smtp` or `filesystem`. The filesystem notifier writes the "emails" to a file, and the docs say it is for testing only. Self-service reset and 2FA enrolment go through the notifier. R3 works only through this workaround.
- **Brute force:** `regulation` uses `max_retries` (default 3), `find_time` and `ban_time` (default 5m), in `user` or `ip` mode. This is a **temporary ban**, a lockout and not a slowdown, so R5 is only approximated.
- **First run:** there is no claim step because users come from the file, so R4 has no exposure.
- **OIDC:** the provider is OpenID Certified but still labelled **beta** on the roadmap. Authelia also expects to sit behind a reverse proxy, with a session cookie domain.
- **Storage and size:** SQLite, Postgres or MySQL. It is one container of roughly 20 to 50 MB **(unverified)**.
- **Activity:** very active (2,634 commits since 2025-10, about 400 by humans).

### LLDAP + Authelia (LLDAP v0.6.3, GPL-3.0, Rust)
- **What LLDAP adds:** a small web UI where admins create users, set passwords, set display names and manage groups. It uses SQLite by default (`sqlite:///data/users.db`).
- **Email and resets:** password reset by email works only "if you configured the SMTP client". An admin can set a password directly in the UI. There are no invite links, so the admin sets an initial password and shares it.
- **Admin bootstrap:** the admin password comes from config (`LLDAP_LDAP_USER_PASS`). `force_ldap_user_pass_reset` resets it to that value on start, which approximates R7.
- **Email login:** through Authelia's LDAP `users_filter`, which can match username or mail **(unverified for the exact LLDAP preset)**.
- **Cost:** two containers, two configs, and an LDAP bind between them. Brute force is still Authelia's ban (R5 approximated).

### Authentik (2026.8.4, MIT core plus a source-available enterprise directory, Python/Go)
- **Size:** server, worker and **PostgreSQL**. Redis was removed in 2025.10. The docs ask for a host with at least 2 CPU and **2 GB RAM**. The default compose mounts the Docker socket into the worker. **R1 fails.**
- **Features:** flows are fully configurable, and email or username identification is supported. Admin UI: users, set password, "Create recovery link" with no email stage needed, and invitation links you can **copy**. R3 and R6 are met.
- **First run:** the `/if/flow/initial-setup/` flow sets the `akadmin` password. Whoever reaches it first claims the instance unless `AUTHENTIK_BOOTSTRAP_PASSWORD(_HASH)` is preset, so R4 needs config.
- **Recovery:** `ak create_recovery_key 10 akadmin` prints a recovery **link**, which covers R7 in spirit.
- **Brute force:** a Reputation policy (score per IP and/or username) is normally used to add a CAPTCHA. It is not an exact match for R5.
- **Fit:** very capable, but heavy for this use.

### Kanidm (v1.11.2, MPL-2.0, Rust)
- **Size:** one container with an embedded database. The server **must have TLS certificates itself**, even behind a proxy.
- **Login:** by account name (SPN), not email **(unverified that email login is impossible)**. Passwords go through **zxcvbn, which "can not be disabled"**, and the minimum length is set per group. R2 fails on "no composition rules" in spirit, because weak passwords are rejected.
- **Credentials:** passkeys are preferred. Password+TOTP prompts for TOTP first. `credential-type-minimum` can be `any`, `mfa`, `passkey` or `attested_passkey`.
- **Onboarding and resets:** done with **credential reset tokens or links** that the admin creates (`kanidm person credential create-reset-token`) and shares without email. R3 is met, but this is mostly CLI work. The web admin UI is limited **(unverified current extent)**.
- **Recovery:** `kanidmd recover-account admin` prints a new password, so R7 is met. Failed attempts trigger a credential "softlock" that grows with failures, which is close to R5.
- **Fit:** opinionated, with the most security friction of all the candidates.

### Pocket ID (v2.18.0, BSD-2-Clause, Go)
- **Size:** one container with SQLite (or Postgres). OpenID Certified.
- **Passwords:** the README says it "**only supports passkey authentication**". The code has no password model, so **R2 fails** and this rules it out.
- **Everything else:** signup tokens (invite links), one-time access tokens from a CLI, and a first-admin setup that is "not available" once completed. The first-run setup appears claimable by whoever arrives first **(unverified)**.

### Zitadel (v4.19.5, AGPL-3.0, Go)
- **Size:** the official compose runs `zitadel-api`, `zitadel-login` (a separate Next.js login app), **PostgreSQL** (now the only supported database), Redis, an OTEL collector and Traefik. **R1 fails badly.**
- **Features:** email login, admin-set initial passwords and a lockout policy (max attempts, then the account is locked until an admin unlocks it). That lockout contradicts R5 **(unverified details)**. Multi-tenant and built for SaaS-scale use.

### Keycloak (26.8.1, Apache-2.0, Java)
- **Storage:** the default `dev-file` database "is not suitable for production", so production needs Postgres or another external database. R1 fails.
- **Bootstrap:** `--bootstrap-admin-username/password` creates a **temporary** admin, and a recovery mode exists (R4 and R7 are met with config).
- **Brute force:** detection supports permanent, temporary or mixed lockout, with "quick login" waits. It is lockout-based, not a slowdown.
- **Features:** login by email (a realm setting), and an admin can set a temporary password without SMTP. There are no invites without email **(unverified)**.
- **Size:** a JVM using roughly 500 MB to 1+ GB **(unverified)**.

### Rauthy (v0.37.1, Apache-2.0, Rust)
- **Size and storage:** one container with embedded **Hiqlite** (SQLite plus Raft), with Postgres optional. The docs give about **57 MB** for a single Hiqlite instance.
- **Email login:** users are identified by **email** (the default admin is `admin@localhost`), so R2 is met for login. The password policy is configured in the admin UI **(unverified that composition rules can all be set to zero)**.
- **First run:** the server generates the admin password and **prints it in the log once**. This is very close to R4, and it can also be bootstrapped from config.
- **SMTP is optional:** with `SMTP_URL` unset the mailer logs "cannot send out any E-Mails" and continues. The admin UI's user password tab has "manual init" to **set a user's password directly**, plus a "send reset email" button. R3 and R6 are met, though there are no copyable invite links **(unverified)**.
- **Brute force:** a delay that increases with failed attempts, plus automatic **IP** blacklisting (7 failures for 1 minute, rising to 25+ failures for 1 day). This is slowdown-like, but keyed on IP rather than on the account (R5 is partial).
- **Gaps:** names are `given_name`/`family_name`, not one display name (R8 partial). A CLI that prints a temporary admin password was not found (R7 unverified).
- **Maturity:** pre-1.0, mostly a single maintainer (201 of about 260 human commits since 2025-10 are by sebadob).

### VoidAuth (v1.16.0, AGPL-3.0, TypeScript) — **found during research; built on our planned stack**
- **Stack:** Node, `oidc-provider` ^9.12.2, knex, `better-sqlite3` or `pg`, express and Angular. This is almost exactly the app we would build.
- **Size:** one container with SQLite (`DB_ADAPTER: sqlite`).
- **Login:** by **username or email** (`getUserByInput`). The `name` field is separate from email (R8 met).
- **First run:** the server prints a **password reset link for the initial `auth_admin` user in the logs**, which meets R4.
- **No SMTP needed:** invitations produce a copyable link. "Users cannot be created, only invited", so people choose their own password. The admin Password Resets page creates a copyable reset link. `voidauth user password-reset <user>` prints a reset link from the CLI (R7 met as a link). Sign-up is off by default. SMTP is optional, and `EMAIL_VERIFICATION` defaults to off without SMTP.
- **Passwords:** checked with zxcvbn, `PASSWORD_STRENGTH` default 3, configurable 0 to 4. Setting it to 0 approximates "no composition rules", but no minimum length was seen **(unverified)**.
- **Brute force:** `express-rate-limit` **per IP** (`API_RATELIMIT` 60 per minute on sensitive routes). There is no per-account slowdown (R5 is not met as specified).
- **Maturity:** young, starting 2025-04 (v1.0.0), and effectively **one maintainer**. Also includes ForwardAuth, an LDAP server, passkeys and TOTP.

### Others considered briefly
- **Tinyauth** (AGPL-3.0, Go; OpenID Certified Basic OP as of v5.1.0): users are defined in config/env, with no admin UI or invites **(unverified)**. It fails R6.
- **Dex, Ory Hydra/Kratos, Logto, Casdoor:** not researched in depth. Dex has static or connector users and no admin UI. Hydra is headless and still needs a login/consent app, which is the same work as building. Logto and Casdoor need Postgres/MySQL. None looks a better fit than Rauthy or VoidAuth **(unverified)**.

## Comparison

Fit key: **Y** met out of the box · **C** met with configuration or a workaround · **P** partial · **N** not met · **?** unverified.

| | R1 one small container, SQLite | R2 email + password, no composition | R3 no SMTP | R4 first-run protection | R5 per-account slowdown, no lockout | R6 admin UI create/invite/reset | R7 CLI recovery for admin | R8 display name | R9 OIDC | Containers / RAM | Licence | Maturity |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Build on `oidc-provider`** | Y | Y | Y | Y | Y | Y (we write it) | Y | Y | Y (certified library) | 1 / tens of MB | ours (library MIT) | library mature; our code new |
| Authelia | Y (SQLite, users file) | C (email search "experimental") | C (filesystem notifier, "testing only") | Y (no claim step) | P (ban = lockout) | **N** (edit YAML; UI unreleased) | C (edit file + hash CLI) | Y | Y (certified, "beta") | 1 / ~30 MB? | Apache-2.0 | very active, mature |
| LLDAP + Authelia | P (2 containers, SQLite) | C | C | Y (admin password in env) | P (ban) | C (UI create/set password; no invite links) | C (force reset from env) | Y | Y | 2 / ~60 MB? | GPL-3.0 + Apache-2.0 | mature |
| Authentik | N (server+worker+Postgres) | Y | Y (copy invite/recovery links) | C (bootstrap env) | P (reputation policy) | Y | Y (recovery-key link) | Y | Y | 3 / ≥2 GB host | MIT + enterprise | very mature |
| Kanidm | Y (embedded DB; needs own TLS) | N (username; zxcvbn always on) | Y (reset tokens) | ? | C (softlock) | P (mostly CLI) | Y (`recover-account`) | Y | Y | 1 / ~100 MB? | MPL-2.0 | mature |
| Pocket ID | Y | **N** (passkeys only) | Y | ? | – | Y | C (one-time token CLI) | Y | Y (certified) | 1 / ~30 MB? | BSD-2 | active |
| Zitadel | N (api+login+Postgres+Redis+…) | Y | C | C (env first instance) | N (hard lockout?) | Y | ? | Y | Y | 4+ / ~1 GB? | AGPL-3.0 | mature |
| Keycloak | N (needs Postgres) | Y (realm setting) | C (admin sets temporary password) | C (bootstrap temp admin) | P (temporary lockout) | C (no invites without email?) | Y (bootstrap recovery) | Y | Y | 2 / ~1 GB? | Apache-2.0 | very mature |
| Rauthy | Y (Hiqlite, ~57 MB) | Y? (email identity; policy?) | Y (SMTP optional) | **Y** (password printed in log) | P (rising delay + **IP** blacklist) | C (create + set password manually; no invite link?) | ? | P (given/family) | Y | 1 / ~57 MB | Apache-2.0 | pre-1.0, ~1 maintainer |
| VoidAuth | Y (SQLite) | C (username or email; strength 0–4) | Y (copy links) | **Y** (reset link in log) | P (**IP** rate limit only) | Y (invites + reset links) | C (CLI prints reset link) | Y | Y (on `oidc-provider`) | 1 / ? | AGPL-3.0 | young, 1 maintainer |

Nothing meets all nine requirements as written. The usual misses are **R5** (everyone else uses IP limits or lockouts) and the exact wording of **R7** (most print a link, not a temporary password). Among the light, single-container options, **Rauthy** and **VoidAuth** come closest.

## What building on `oidc-provider` involves

**The library**
- `oidc-provider` 9.12.2 (2026-09-05), MIT licensed, ESM, by Filip Skokan (panva), who also maintains `jose` and `openid-client`.
- It is **OpenID Certified**. Releases are frequent: 9.11.x and 9.12.x shipped between July and September 2026, with 239 of 275 commits since 2025-10 by the maintainer. Auth0/Okta sponsors it.
- **Risk:** it has effectively one maintainer, and major versions have breaking changes (6 → 7 → 8 → 9).
- **What it covers:** the protocol: authorization code + PKCE, refresh tokens, discovery, JWKS, end-session, token rotation and grant checks. That is the part most worth not writing ourselves.
- **What it leaves to us:**
  - `findAccount`: loading accounts and resolving their claims.
  - The **interaction views**, meaning the login and consent screens.
  - The persistence **adapter**.
  - Key and cookie-secret management.
  - The library's `devInteractions` "MUST NOT be used in production".

**What we would write** (rough guess: 2,000 to 3,500 lines of TypeScript plus tests)
1. A SQLite adapter for the library's models: Session, Interaction, AuthorizationCode, AccessToken, RefreshToken, Grant, and so on. About 150 to 300 lines, with expiry cleanup. `example/my_adapter.js` in the repo shows the interface.
2. Interaction routes: a login form (email + password, scrypt as in Notes ADR 11 (`apps/notes/docs/adr/0011-local-password-accounts.md`)), automatic consent for first-party clients, logout, CSRF protection and error pages.
3. Account features: users, invites with copyable links, admin password reset, display name, the setup code printed on first run, a per-account slowdown table, and a CLI that prints a temporary password.
4. An admin UI with users, invites and sessions.
5. Operations: JWKS generation, persistence and rotation, cookie keys, a static client list (Notes) from env or config, a health endpoint, and backups covered by `DATA_DIR`.
6. Notes as a relying party: an OIDC client (`openid-client`), then Notes' own long-lived session cookie (Notes ADR 11) once the code exchange succeeds.

**Security risk**
- The protocol risk is mostly covered by the certified library.
- The remaining risk is in **our** code: interaction and login handling, CSRF, session fixation, open redirects (the library validates `redirect_uri`), timing-safe password checks, invite and reset token entropy and single use, and key storage.
- That surface is about the same as Notes' local accounts already planned in ADR 11, plus the adapter and the key handling.
- **VoidAuth is a working public reference for this exact stack** and is worth reading. It is AGPL-3.0, so copying its code into this repo would carry AGPL obligations; read it, do not copy it.

## Recommendation

1. **Do not adopt Authelia,** the option the ADR index names today. It has no user management UI: v4.40's admin dashboard is unreleased and user management is unscheduled. Without SMTP it relies on a notifier documented as testing-only, and it bans rather than slows down. Making R6 work adds LLDAP, which means two containers and two configs.
2. **Rule out Authentik, Zitadel and Keycloak for R1** (Postgres plus several containers or a JVM), Pocket ID for R2 (passkeys only) and Kanidm for R2 (username login, zxcvbn that cannot be disabled, and the server must hold its own TLS certificates).
3. **Build the `accounts` app on `oidc-provider`**, the option already listed, because it is the only path that meets all of R1 to R9 exactly. The protocol is handled by a certified, actively maintained MIT library. The rest is mostly the password-account code ADR 11 already commits to writing for Notes, moved into a shared app. Keep scope small: one static client list, automatic consent for first-party apps, and no dynamic registration.
4. **If owning auth code is unwanted, the best adopt option is Rauthy.** It is a single 57 MB container with embedded SQLite, email identity, an admin password printed in the log on first run, optional SMTP and admin-set passwords, under Apache-2.0. Accepting it means relaxing R5 to IP-based slowdown, R7 to a reset done another way, and R8 to given/family name. **VoidAuth** is the other option: it meets R3, R4 and R6 best, but it is AGPL, young and run by one maintainer.
5. **Next step:** a one-hour spike that runs Rauthy and VoidAuth in docker against a test OIDC client to confirm the **(unverified)** rows, mainly Rauthy's password-policy knobs and admin recovery CLI, and VoidAuth's minimum password length. Run it before the human decision, then record that decision as a platform ADR.

## Sources (all fetched 2026-10-17)

- Authelia repo `docs/content/`: `configuration/first-factor/file.md`, `configuration/security/regulation.md`, `configuration/notifications/{introduction,file}.md`, `configuration/identity-validation/reset-password.md`, `configuration/storage/introduction.md`, `roadmap/active/dashboard-control-panel-and-cli-for-admins.md`, `roadmap/active/openid-connect-1.0-provider.md`, `reference/guides/passwords.md`.
- LLDAP repo: `README.md`, `lldap_config.docker_template.toml`, `LICENSE`.
- Authentik repo `website/docs/`: `install-config/install/docker-compose.mdx`, `install-config/automated-install.mdx`, `releases/2025/v2025.10.mdx`, `customize/policies/types/reputation.mdx`, `users-sources/user/invitations.mdx`, `users-sources/user/user_basic_operations.mdx`, `troubleshooting/login.mdx`; root `docker-compose.yml`, `LICENSE`.
- Kanidm repo `book/src/`: `accounts/authentication_and_credentials.md`, `accounts/people_accounts.md`, `accounts/account_policy.md`, `preparing_for_your_deployment.md`, `evaluation_quickstart.md`; `server/lib/src/idm/account.rs` (softlock).
- Pocket ID repo: `README.md`, `backend/internal/usersignup/`, `backend/internal/cmds/one_time_access_token.go`, `LICENSE`.
- Zitadel repo: `deploy/compose/docker-compose.yml`, `apps/docs/content/self-hosting/manage/database/index.mdx`, `LICENSING.md`.
- Keycloak repo `docs/`: `documentation/server_admin/topics/threat/brute-force.adoc`, `guides/server/bootstrap-admin-recovery.adoc`, `guides/server/db.adoc`.
- Rauthy repo: `book/src/{intro.md, getting_started/first_start.md, getting_started/docker.md, config/config.md, config/bootstrap.md, work/ip_blacklist.md}`, `frontend/src/lib/admin/users/UserPassword.svelte`, `src/data/src/email/mailer.rs`, `LICENSE`.
- VoidAuth repo: `README.md`, `package.json`, `docs/{Getting-Started,Configuration,User-Management,Password-Resets,CLI-Commands}.md`, `shared/api-request/LoginUser.ts`, `shared/db/User.ts`, `server/util/{rateLimit,zxcvbn}.ts`, `server/routes/interaction.ts`.
- Tinyauth repo: `README.md`, `LICENSE`.
- `oidc-provider`: repo `README.md`, `CHANGELOG.md`, `docs/README.md` (`devInteractions`, `findAccount`, `interactions.url`), `example/my_adapter.js`, `LICENSE.md`; npm registry metadata (`latest` 9.12.2, published 2026-09-05).
