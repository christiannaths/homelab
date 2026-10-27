# Homelab

Self-hosted apps a household installs on its own server and uses with one shared sign-in.

## People and access

**Homelab account**: The one account a person signs in with to every app; signing out signs the browser out of all of them. _Avoid_: user account, app account, login

**Homelab admin**: Invites people and sets which apps each can use, at what level. Opens no app by itself. _Avoid_: superuser, root

**App access**: An admin's grant of one app to one person, at member or admin level; sent as `Remote-Groups` `<app>` / `<app>-admins` ([ADR-PLAT-009](docs/adr/ADR-PLAT-009-app-contract.md)). _Avoid_: permission, role

**Account id**: The permanent id of a homelab account, sent in `Remote-User`; apps key data by it. Survives email and name changes. _Avoid_: username, user id

**Accounts service**: The homelab's Better Auth service at `accounts.<domain>`: sign-in, account management, the gateway's sign-in check, and `/api/me` for the App switcher. _Avoid_: auth server, identity provider, VoidAuth

**Account page**: A person's own page on the accounts service (Account settings in the App switcher), where sign-in lands with no return address: name, email, apps; change name and password. _Avoid_: profile, settings page, account settings, home page, dashboard

**People page**: Admin-only page on the accounts service, linked from the account page: everyone and their apps; change App access and admins; sign people out everywhere; remove accounts; make, list, cancel invites. _Avoid_: admin panel, user management, dashboard

**Invite**: A one-use link for one email, valid a week, granting App access and letting that person make their account. The admin passes it on (the homelab sends no email). A fresh install prints a setup invite for the first admin. _Avoid_: invitation code, sign-up link, registration

## Apps

**App**: One thing a household uses at its own address under the homelab sign-in, e.g. Notes, Encyclopedia. Knows only itself, through the app contract. _Avoid_: service, module, site

**Bundled app**: An existing open-source app run behind the homelab sign-in instead of building one, e.g. Vaultwarden. _Avoid_: third-party app, integration

**Platform**: Everything around the apps: gateway, accounts service, App switcher, manifest reading. Code belongs here when it needs cross-app knowledge such as App access. _Avoid_: core, framework, infrastructure

**App contract**: What an app provides and relies on to plug in ([ADR-PLAT-009](docs/adr/ADR-PLAT-009-app-contract.md)). _Avoid_: app API, plugin interface, integration

**App switcher**: The tab atop every app and its menu: the person's apps, Account settings, Sign out. _Avoid_: widget, apps menu, user menu, launcher
