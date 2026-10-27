# Packages

Libraries any app may import ([ADR-PLAT-002](../docs/adr/ADR-PLAT-002-repo-structure.md)). Nothing here depends on an app or the [platform](../platform); code moves here only once a second app needs it. Each package is an npm workspace tagged `scope:shared` plus a `platform:` tag (`nx` field of `package.json`).

| Package | What it is |
| --- | --- |
| [`theme`](theme) | `@homelab/theme`: colours, type, Mantine theme |
| [`signed-in-state`](signed-in-state) | `@homelab/signed-in-state`: offline-first start-up state (signed in / out / unreachable), remembering the device's last person ([ADR-PLAT-009](../docs/adr/ADR-PLAT-009-app-contract.md)) |
| [`identity`](identity) | `@homelab/identity`: writes and reads the identity headers (person + level per app) ([ADR-PLAT-009](../docs/adr/ADR-PLAT-009-app-contract.md)) |
