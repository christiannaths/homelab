# LocalNotion

A lean, self-hosted Notion-style workspace for homelabs. **Offline-first**: every device keeps a full copy of the workspace. **Multiplayer**: edits and cursors sync live between users.

The `notes` app in the [homelab monorepo](../../README.md).

> Status: **early.** The [server](server/README.md) signs people in through VoidAuth and syncs documents. The [web client](web) signs in with the homelab account, opens offline, and has one page so far. The app is built against the decisions already settled:
>
> - [`docs/adr/`](docs/adr/README.md): the Notes ADRs, including what is deliberately _not_ decided yet, plus the [platform ADRs](../../docs/adr/README.md) for the whole repo
> - [`docs/specs/`](docs/specs): the feature specs
> - [`docs/research/`](docs/research): the landscape survey, requirements, architecture sketch and spike findings
>
> The spike that settled those decisions is kept, frozen, in [`spikes/notes-block-editing-collaboration-poc/`](../../spikes/notes-block-editing-collaboration-poc/README.md).
