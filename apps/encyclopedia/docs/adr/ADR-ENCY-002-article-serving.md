# ADR-ENCY-002. How are articles and search served to readers?

- Status: Accepted
- Date: 2026-10-18
- Depends on: [ADR-ENCY-001](ADR-ENCY-001-content-source.md), [ADR-PLAT-001](../../../../docs/adr/ADR-PLAT-001-toolchain.md)
- Dependency of: [ADR-ENCY-003](ADR-ENCY-003-licensing.md), [ADR-ENCY-005](ADR-ENCY-005-offline-use.md), [ADR-ENCY-006](ADR-ENCY-006-article-presentation.md)

## Context

The content is one large ZIM file on the server ([ADR-ENCY-001](ADR-ENCY-001-content-source.md)). A browser cannot read a ZIM file over the network: kiwix-js reads only files on the device, and its maintainers have no plans to change that. Kiwix's own server, kiwix-serve, serves articles and search but has no accounts. Encyclopedia also needs sign-in and saved lists, and installers should run as few services as possible.

## Decision

- **Encyclopedia has its own server**, in TypeScript on Node.js ([ADR-PLAT-001](../../../../docs/adr/ADR-PLAT-001-toolchain.md)), that reads the ZIM file with `@openzim/libzim`. It serves articles, images, search, saved lists and the content settings. kiwix-serve is not used.
- **Reads and searches run in worker threads,** because libzim's calls are synchronous and would otherwise block every other request.
- **Search uses the indexes inside the ZIM file:** title suggestions as the reader types, and full-text search across the whole encyclopedia.
- **Installers run one service** for Encyclopedia, besides the homelab's shared sign-in.

## Alternatives considered

- **kiwix-serve behind a homelab server** that adds sign-in and saved lists. It is less code, and it keeps the app's own code free of the GPL, but installers run two services and every request crosses both. The GPL is accepted for this app ([ADR-ENCY-003](ADR-ENCY-003-licensing.md)).
- **The browser reads the ZIM file itself, as kiwix-js does.** It would need the whole file on every device, which offline use rules out ([ADR-ENCY-005](ADR-ENCY-005-offline-use.md)).

## Evidence

- `@openzim/libzim` 4.7.0 supports Node 22, 24 and 26 on Linux (x64, arm64, armhf) and macOS, with full-text search, title suggestions and byte-range reads, and its calls are synchronous: [`research/02-zim-and-libzim.md`](../research/02-zim-and-libzim.md).
- kiwix-js cannot read a ZIM file over HTTP, and kiwix-serve has no authentication: same document.
- Product decision by Christian, 2026-10-18, in the project thread: our own server, one service.
- Nothing has been built yet. Whether libzim installs on the chosen base image is untested.

## Consequences

- `npm install` compiles libzim's Node addon, so the server's image needs a C++ toolchain, glibc and network access to `download.openzim.org` at build time. Alpine images are untested.
- The server's code is GPLv3 ([ADR-ENCY-003](ADR-ENCY-003-licensing.md)).
- Search results come only from the ZIM's own indexes. Better ranking or other languages' indexes would mean building an index of our own.
- If libzim's Node binding stops being maintained, the fallback is kiwix-serve behind our server.
