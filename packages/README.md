# Packages

Libraries apps may use ([ADR-PLAT-002](../docs/adr/ADR-PLAT-002-repo-structure.md)): importing from here is always safe for an app, and nothing here depends on an app or on the [platform](../platform). Code moves here only when a second app needs it. Each package is an npm workspace with `scope:shared` and a `platform:` tag in the `nx` field of its `package.json`.

| Package | What it is |
| --- | --- |
| [`theme`](theme) | `@homelab/theme`: the homelab's colours, type and Mantine theme |
| [`identity`](identity) | `@homelab/identity`: writes and reads the identity headers, the person on a request and their level in each app ([ADR-PLAT-009](../docs/adr/ADR-PLAT-009-app-contract.md)) |
