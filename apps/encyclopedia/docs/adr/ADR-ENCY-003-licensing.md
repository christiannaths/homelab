# ADR-ENCY-003. How does the app meet the licences of the code and content it uses?

- Status: Accepted
- Date: 2026-10-18
- Depends on: [ADR-ENCY-001](ADR-ENCY-001-content-source.md), [ADR-ENCY-002](ADR-ENCY-002-article-serving.md), [ADR-PLAT-007](../../../../docs/adr/ADR-PLAT-007-licensing.md)
- Dependency of: [ADR-ENCY-006](ADR-ENCY-006-article-presentation.md)

## Context

The server links `@openzim/libzim` ([ADR-ENCY-002](ADR-ENCY-002-article-serving.md)), GPLv3-or-later like kiwix-js, libkiwix and kiwix-serve; linking makes one combined work that must be published under the GPL with source. Wikipedia text is CC BY-SA 4.0 and GFDL, images have their own licences (some fair use), and every installer serving it is sharing it. "Wikipedia" is a Wikimedia Foundation trademark; the rest of the homelab is MIT ([ADR-PLAT-007](../../../../docs/adr/ADR-PLAT-007-licensing.md)).

## Decision

- **`apps/encyclopedia` is GPLv3-or-later**, via its own `LICENSE` overriding the repo's MIT for that folder ([ADR-PLAT-007](../../../../docs/adr/ADR-PLAT-007-licensing.md)). May link libzim and reuse kiwix-js code.
- **Article text shared under CC BY-SA 4.0.** Every article must keep mwoffliner's attribution footer (source revision link, licence, note that media may differ).
- **"About and licences" page**: text from Wikipedia under CC BY-SA 4.0, images under their own licences, styling changed.
- **Article text never changes.** Restyling is fine ([ADR-ENCY-006](ADR-ENCY-006-article-presentation.md)); summaries, rewrites or generated digests aren't.
- **Never named "Wikipedia", no Wikimedia logo.** May say it serves content from Wikipedia (name in full), and carries: "Wikipedia is a trademark of the Wikimedia Foundation. This project is not affiliated with or endorsed by it."

## Alternatives considered

- **MIT with kiwix-serve as a separate service**: HTTP very likely keeps our code outside the GPL, but adds a service ([ADR-ENCY-002](ADR-ENCY-002-article-serving.md)).
- **Calling it "Wikipedia" or a "Wikipedia clone"**: needs a Wikimedia trademark licence.

## Evidence

- [`research/03-licensing.md`](../research/03-licensing.md): each piece's licence, GPL text, CC BY-SA 4.0 legal code, ZIM attribution, trademark policy. Wikimedia pages and the GPL FAQ were read only via search excerpts (unreachable); each such claim is marked.
- Christian, 2026-10-18, project thread: GPL for Encyclopedia, MIT for the rest.
- Not legal advice.

## Consequences

- Anyone sharing a changed Encyclopedia must share source under the GPL.
- `@homelab/*` packages stay MIT, which is compatible: bundled in, they're part of a GPL work.
- Full-image files credit image licences only via the footer and article link; installers avoiding image licensing can pick a no-image file ([ADR-ENCY-001](ADR-ENCY-001-content-source.md)).
