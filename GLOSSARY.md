# Homelab

Self-hosted apps a household installs on its own server and uses with one shared sign-in.

## People and access

**Homelab account**: The one account a person signs in with to every app. Signing out of it signs the browser out of every app. _Avoid_: user account, app account, login

**Homelab admin**: A person who invites people and decides which apps each of them can use, and at what level. _Avoid_: superuser, root

**App access**: A homelab admin's grant letting one person use one app, at a member or admin level. _Avoid_: permission, role, group (VoidAuth's name for how it is stored)

## Apps

**App**: One thing a household uses under the homelab's sign-in, at its own address, such as Notes or Encyclopedia. _Avoid_: service, module, site

**Bundled app**: An existing open-source app that homelab runs behind its sign-in instead of building its own, such as Vaultwarden. _Avoid_: third-party app, integration

**Home**: The app every homelab account can open, which shows the apps a person can use. _Avoid_: home page, dashboard, launcher, portal

**App switcher**: The tab at the top of every app and the menu it opens, listing the person's apps, Account settings and Sign out. _Avoid_: widget, apps menu, user menu, launcher
