# ADR-PLAT-007. How is the homelab's code licensed?

- Status: Accepted
- Date: 2026-10-18
- Depends on: none
- Dependency of: [ADR-ENCY-003](../../apps/encyclopedia/docs/adr/ADR-ENCY-003-licensing.md)

## Context

The homelab is released as free and open source software for anyone to install. Code with no licence is all rights reserved, so nobody may legally use it. Christian does not mind what people do with the code once released. Some apps build on libraries under licences that bind the app itself, such as the GPL.

## Decision

- **The repo is licensed under the MIT licence**, in the root `LICENSE` file and the root `package.json`.
- **An app may carry its own licence** when a library it depends on requires one. Its licence file sits in the app's folder, overrides MIT for that folder, and the app's ADRs record why.
- **Shared packages stay MIT,** so every app can use them whatever its own licence.

## Alternatives considered

- **GPLv3 for the whole repo.** It is also free and open source, but it requires anyone who shares a changed copy to share their source, which is more than Christian asks for.
- **No licence until a first release.** Until a licence exists, nobody may legally install a copy.

## Evidence

- Christian, 2026-10-18, in the project thread: "The goal of the project is to release this as free and open source software. I'm not concerned with what people do with it after." He chose MIT for the homelab and the GPL for Encyclopedia.
- Licence research for Encyclopedia: [`research/03-licensing.md`](../../apps/encyclopedia/docs/research/03-licensing.md).

## Consequences

- Encyclopedia is GPLv3 ([ADR-ENCY-003](../../apps/encyclopedia/docs/adr/ADR-ENCY-003-licensing.md)), because it links GPL code.
- Before adding a dependency, an app checks that its licence is compatible with the app's licence.
- Spikes fall under MIT unless they carry their own licence file.
