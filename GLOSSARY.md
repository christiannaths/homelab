# Homelab

Self-hosted apps a household installs on its own server and uses with one shared sign-in.

## People and access

**Homelab account**: The one account a person signs in with to every app. Signing out of it signs the browser out of every app. _Avoid_: user account, app account, login

**Homelab admin**: A person who invites people and decides which apps each of them can use, and at what level. Being one opens no app by itself. _Avoid_: superuser, root

**App access**: A homelab admin's grant letting one person use one app, at a member or admin level. It reaches apps as groups in `Remote-Groups`: `<app>` for a member, `<app>-admins` for an admin, which `@homelab/identity` writes and reads back as a level per app. _Avoid_: permission, role

**Account id**: The permanent id the accounts service gives a homelab account, which apps receive in `Remote-User` and key a person's data by. It never changes, even when the person's email or name does. _Avoid_: username, user id

**Accounts service**: The homelab's own service at `accounts.<domain>`, on Better Auth, where people sign in and manage their homelab account, and which tells the gateway who is signed in. _Avoid_: auth server, identity provider, VoidAuth

**Account page**: A person's own page on the accounts service, which Account settings in the App switcher opens. It shows their name, email and apps, and lets them change their name and password. _Avoid_: profile, settings page, account settings

**People page**: The homelab admins' page on the accounts service, linked from their account page, where they see everyone with their apps, change App access and who is a homelab admin, sign people out everywhere, remove accounts, and make, list and cancel invites. Nobody else can open it. _Avoid_: admin panel, user management, dashboard

**Invite**: A link a homelab admin makes for one email, granting App access, that lets that person make their homelab account once, within a week. The admin passes it on themselves, since the homelab sends no email. On an install with no accounts, the accounts service prints a setup invite that makes the first homelab admin. _Avoid_: invitation code, sign-up link, registration

## Apps

**App**: One thing a household uses under the homelab's sign-in, at its own address, such as Notes or Encyclopedia. It works through the app contract alone and knows only about itself, never about other apps or a person's App access to them. _Avoid_: service, module, site

**Bundled app**: An existing open-source app that homelab runs behind its sign-in instead of building its own, such as Vaultwarden. _Avoid_: third-party app, integration

**Home**: The platform's own installable page at `home.<domain>`, which every homelab account can open and which shows the apps a person can use. It is part of the platform, since it needs a person's App access across every app, and an install can leave it out. _Avoid_: home page, dashboard, launcher, portal

**Platform**: Everything around apps that runs them for a household: the gateway, the accounts service, Home, the App switcher and the reading of apps' manifests. Code belongs to it when it needs platform knowledge, such as a person's App access across apps. _Avoid_: core, framework, infrastructure

**App contract**: What an app must provide and may rely on to plug into the homelab: its own subdomain, a manifest and icons readable signed out, the person on every request in headers, no signed-out requests, and the App switcher on its pages. _Avoid_: app API, plugin interface, integration

**App switcher**: The tab at the top of every app and the menu it opens, listing the person's apps, Account settings and Sign out. _Avoid_: widget, apps menu, user menu, launcher
