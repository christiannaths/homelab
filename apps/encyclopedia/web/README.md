# Encyclopedia web

The installable web app; for now a title page that opens offline ([ADR-ENCY-005](../docs/adr/ADR-ENCY-005-offline-use.md)). No sign-in of its own ([ADR-ENCY-004](../docs/adr/ADR-ENCY-004-identity.md)); sign-out is the gateway-added [App switcher](../../../platform/app-switcher/README.md).

```sh
npx nx run encyclopedia-web:dev      # Vite dev server, no service worker
npx nx run encyclopedia-web:build    # static files in dist/
npx nx run encyclopedia-web:preview  # serves dist/ on port 4173
```
