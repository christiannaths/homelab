# ADR-ENCY-002. How are articles and search served to readers?

- Status: Accepted
- Date: 2026-10-18
- Depends on: [ADR-ENCY-001](ADR-ENCY-001-content-source.md), [ADR-PLAT-001](../../../../docs/adr/ADR-PLAT-001-toolchain.md)
- Dependency of: [ADR-ENCY-003](ADR-ENCY-003-licensing.md), [ADR-ENCY-005](ADR-ENCY-005-offline-use.md), [ADR-ENCY-006](ADR-ENCY-006-article-presentation.md)

## Context

The content is one large ZIM file on the server ([ADR-ENCY-001](ADR-ENCY-001-content-source.md)). Browsers can't read ZIM over the network (kiwix-js reads only local files, with no plans to change), and kiwix-serve has no accounts. Encyclopedia needs sign-in and saved lists, with as few services as possible.

## Decision

- **Own server**, TypeScript on Node.js ([ADR-PLAT-001](../../../../docs/adr/ADR-PLAT-001-toolchain.md)), reading the ZIM with `@openzim/libzim`: articles, images, search, saved lists, content settings. No kiwix-serve.
- **Reads and searches in worker threads**: libzim is synchronous and would block other requests.
- **Search uses the ZIM's indexes**: title suggestions while typing, full-text across everything.
- **One service** to run, besides the shared sign-in.

## Alternatives considered

- **kiwix-serve behind a homelab server**: less code and no GPL in our code, but two services and every request crosses both. GPL is accepted ([ADR-ENCY-003](ADR-ENCY-003-licensing.md)).
- **Browser reads the ZIM (kiwix-js)**: whole file on every device, ruled out by offline use ([ADR-ENCY-005](ADR-ENCY-005-offline-use.md)).

## Evidence

- [`research/02-zim-and-libzim.md`](../research/02-zim-and-libzim.md): `@openzim/libzim` 4.7.0 supports Node 22/24/26 on Linux (x64, arm64, armhf) and macOS, with full-text search, suggestions, byte-range reads; synchronous calls.
- Same doc: kiwix-js can't read ZIM over HTTP; kiwix-serve has no auth.
- Christian, 2026-10-18, project thread: own server, one service.
- Nothing built; libzim on the chosen base image untested.

## Consequences

- `npm install` compiles libzim's addon: the image needs a C++ toolchain, glibc and access to `download.openzim.org` at build. Alpine untested.
- Server code is GPLv3 ([ADR-ENCY-003](ADR-ENCY-003-licensing.md)).
- Search is only as good as the ZIM's indexes; better ranking or other languages means our own index.
- If libzim's Node binding dies, fall back to kiwix-serve behind our server.
