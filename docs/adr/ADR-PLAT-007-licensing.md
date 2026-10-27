# ADR-PLAT-007. How is the homelab's code licensed?

- Status: Accepted
- Date: 2026-10-18
- Depends on: none
- Dependency of: [ADR-ENCY-003](../../apps/encyclopedia/docs/adr/ADR-ENCY-003-licensing.md)

## Context

The homelab is FOSS for anyone to install, and unlicensed code can't legally be used. Some apps link libraries, like the GPL, that bind the app's licence.

## Decision

- **MIT for the repo** (root `LICENSE`, root `package.json`), including spikes.
- **An app may carry its own licence** when a dependency requires it: a licence file in its folder overrides MIT there, and its ADRs say why.
- **Shared packages stay MIT**, so any app can use them.

## Alternatives considered

- **GPLv3 for the repo**: demands shared source from anyone sharing changes, more than Christian asks.
- **No licence until release**: nobody could legally install it meanwhile.

## Evidence

- Christian, 2026-10-18: "release this as free and open source software. I'm not concerned with what people do with it after." Chose MIT, and GPL for Encyclopedia ([`research/03-licensing.md`](../../apps/encyclopedia/docs/research/03-licensing.md)).

## Consequences

- Encyclopedia is GPLv3 ([ADR-ENCY-003](../../apps/encyclopedia/docs/adr/ADR-ENCY-003-licensing.md)).
- A new dependency's licence must be compatible with the app's.
