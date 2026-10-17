# Shared packages

Code used by more than one app. Code moves here only when a second app needs it ([ADR 15](../docs/adr/0015-repo-structure.md)). Each package is an npm workspace with `scope:shared` and a `platform:` tag in the `nx` field of its `package.json`.
