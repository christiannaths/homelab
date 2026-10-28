# LocalNotion

Self-hosted Notion-style workspace. **Offline-first**: every device keeps a full copy. **Multiplayer**: edits and cursors sync live.

**Status: early.** The [server](server/README.md) reads identity from the gateway, syncs documents and checks every update; the [web client](web) signs in, opens offline, and lets a person write pages in their Private section, synced across their devices.

| Docs |  |
| --- | --- |
| [`GLOSSARY.md`](GLOSSARY.md) | Notes terms (workspace, teamspace, page, access levels) |
| [`docs/adr/`](docs/adr/README.md) | Notes ADRs and what's not decided; see also [platform ADRs](../../docs/adr/README.md) |
| [`docs/specs/`](docs/specs) | Feature specs |
| [`docs/research/`](docs/research) | Landscape survey, requirements, architecture sketch, spike findings |
| [`spikes/notes-block-editing-collaboration-poc/`](../../spikes/notes-block-editing-collaboration-poc/README.md) | The frozen spike behind the ADRs |
