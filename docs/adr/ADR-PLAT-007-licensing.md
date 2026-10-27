# ADR-PLAT-007. How is the homelab's code licensed?

- Status: Accepted
- Date: 2026-10-18
- Depends on: none
- Dependency of: [ADR-ENCY-003](../../apps/encyclopedia/docs/adr/ADR-ENCY-003-licensing.md)

## Context

The homelab is FOSS for anyone to install; unlicensed code is all rights reserved, so nobody may legally use it. Christian doesn't mind what people do with it once released. Some apps build on libraries whose licences bind the app itself, such as the GPL.

## Decision

- **MIT for the repo**, in the root `LICENSE` and root `package.json`.
- **An app may carry its own licence** when a dependency requires one: a licence file in the app's folder overrides MIT for that folder, and the app's ADRs record why.
- **Shared packages stay MIT**, so every app can use them.

## Alternatives considered

- **GPLv3 for the whole repo**: also FOSS, but makes anyone sharing a changed copy share their source, more than Christian asks.
- **No licence until a first release**: until then nobody may legally install a copy.

## Evidence

- Christian, 2026-10-18, project thread: "The goal of the project is to release this as free and open source software. I'm not concerned with what people do with it after." He chose MIT for the homelab and the GPL for Encyclopedia.
- Encyclopedia licence research: [`research/03-licensing.md`](../../apps/encyclopedia/docs/research/03-licensing.md).

## Consequences

- Encyclopedia is GPLv3 because it links GPL code ([ADR-ENCY-003](../../apps/encyclopedia/docs/adr/ADR-ENCY-003-licensing.md)).
- Before adding a dependency, an app checks its licence is compatible with the app's.
- Spikes are MIT unless they carry their own licence file.
