# Packages

Libraries apps may use ([ADR-PLAT-002](../docs/adr/ADR-PLAT-002-repo-structure.md)): importing from here is always safe for an app, and nothing here depends on an app or on the [platform](../platform). Code moves here only when a second app needs it. Each package is an npm workspace with `scope:shared` and a `platform:` tag in the `nx` field of its `package.json`.

| Package | What it is |
| --- | --- |
| [`theme`](theme) | `@homelab/theme`: the homelab's colours, type and Mantine theme |
| [`signed-in-state`](signed-in-state) | `@homelab/signed-in-state`: an offline-first browser app's start-up state, signed in, signed out or unreachable, with the last person remembered on the device ([ADR-PLAT-009](../docs/adr/ADR-PLAT-009-app-contract.md)) |
| [`identity`](identity) | `@homelab/identity`: writes and reads the identity headers, the person on a request and their level in each app ([ADR-PLAT-009](../docs/adr/ADR-PLAT-009-app-contract.md)) |
