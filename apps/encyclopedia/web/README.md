# Encyclopedia web

The Encyclopedia's installable web app. For now it is a title page that opens with no network ([ADR-ENCY-005](../docs/adr/ADR-ENCY-005-offline-use.md)).

It has no sign-in of its own. Put it behind the homelab's sign-in, which decides who reaches it ([ADR-ENCY-004](../docs/adr/ADR-ENCY-004-identity.md)). Its header holds the [App switcher](../../../packages/app-switcher/README.md), loaded from Home, for signing out and opening the reader's other apps.

```sh
npx nx run encyclopedia-web:dev      # Vite dev server, no service worker
npx nx run encyclopedia-web:build    # static files in dist/
npx nx run encyclopedia-web:preview  # serves dist/ on port 4173
```
