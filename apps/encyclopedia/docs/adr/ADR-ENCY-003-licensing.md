# ADR-ENCY-003. How does the app meet the licences of the code and content it uses?

- Status: Accepted
- Date: 2026-10-18
- Depends on: [ADR-ENCY-001](ADR-ENCY-001-content-source.md), [ADR-ENCY-002](ADR-ENCY-002-article-serving.md), [ADR-PLAT-007](../../../../docs/adr/ADR-PLAT-007-licensing.md)
- Dependency of: [ADR-ENCY-006](ADR-ENCY-006-article-presentation.md)

## Context

The server links `@openzim/libzim` ([ADR-ENCY-002](ADR-ENCY-002-article-serving.md)), which is GPLv3-or-later, as are kiwix-js, libkiwix and kiwix-serve. Linking or bundling GPL code makes one combined work, and publishing it then requires the whole work under the GPL with its source. Wikipedia's text is under CC BY-SA 4.0 and the GFDL, and every installer who serves it to other people is sharing it. Images carry their own licences, some of them fair use. "Wikipedia" is a trademark of the Wikimedia Foundation. The rest of the homelab is MIT ([ADR-PLAT-007](../../../../docs/adr/ADR-PLAT-007-licensing.md)).

## Decision

- **`apps/encyclopedia` is licensed GPLv3-or-later**, in its own `LICENSE` file, which overrides the repo's MIT licence for that folder ([ADR-PLAT-007](../../../../docs/adr/ADR-PLAT-007-licensing.md)). It may link libzim and reuse kiwix-js code directly.
- **Article text is shared under CC BY-SA 4.0.** Every article must keep the attribution footer that Kiwix's mwoffliner adds. The footer links to the source revision, names the licence and notes that media files may have other terms.
- **The app has an "About and licences" page** that says the text comes from Wikipedia under CC BY-SA 4.0, that images have their own licences, and that page styling has been changed.
- **The app never changes article text.** Restyling is allowed ([ADR-ENCY-006](ADR-ENCY-006-article-presentation.md)); summaries, rewrites or generated digests are not.
- **The app is never named "Wikipedia" and never shows a Wikimedia logo.** It may say it serves content from Wikipedia, with the name written in full, and it carries the line: "Wikipedia is a trademark of the Wikimedia Foundation. This project is not affiliated with or endorsed by it."

## Alternatives considered

- **MIT like the rest of the homelab, with kiwix-serve as a separate service.** Talking to kiwix-serve over HTTP very likely keeps our code outside the GPL, but it means a second service to run ([ADR-ENCY-002](ADR-ENCY-002-article-serving.md)).
- **Calling the app "Wikipedia" or a "Wikipedia clone".** It needs a trademark licence from the Wikimedia Foundation.

## Evidence

- [`research/03-licensing.md`](../research/03-licensing.md): the licence of each piece, the GPL text, the CC BY-SA 4.0 legal code, how Kiwix ZIM files carry attribution, and the trademark policy. The Wikimedia pages and the GPL FAQ were read only through search excerpts, because the research environment could not reach them; the document marks each such claim.
- Product decision by Christian, 2026-10-18, in the project thread: GPL for Encyclopedia, MIT for the rest.
- This is not legal advice.

## Consequences

- Anyone who changes Encyclopedia and shares it must share their source under the GPL too.
- Shared `@homelab/*` packages stay MIT, which is compatible: bundled into Encyclopedia, they become part of a GPL work.
- Full-image files carry images whose licences are credited only through the footer and the link back to the article. Installers who want to avoid image licensing questions can pick a no-image file ([ADR-ENCY-001](ADR-ENCY-001-content-source.md)).
