# Packages

Libraries apps may use ([ADR-PLAT-002](../docs/adr/ADR-PLAT-002-repo-structure.md)): importing from here is always safe for an app, and nothing here depends on an app or on the [platform](../platform). Code moves here only when a second app needs it. Each package is an npm workspace with `scope:shared` and a `platform:` tag in the `nx` field of its `package.json`.

| Package | What it is |
| --- | --- |
| [`theme`](theme) | `@homelab/theme`: the homelab's colours, type and Mantine theme |
| [`identity`](identity) | `@homelab/identity`: reads the person on a request from the identity headers ([ADR-PLAT-009](../docs/adr/ADR-PLAT-009-app-contract.md)) |
