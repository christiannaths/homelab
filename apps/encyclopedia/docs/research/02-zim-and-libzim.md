# What Wikipedia ZIM files and libzim offer today

Date: 2026-10-18. Ticket #50. Research only.

This checks and extends the first survey (`/mnt/project-files/research/wikipedia-clone-options.md`). It focuses on the facts the app design depends on: what the files are, how we get them, whether `@openzim/libzim` runs in our stack, whether a browser can read a ZIM remotely, and what kiwix-serve gives us for free.

**Network caveat.** Every Kiwix and openZIM host was unreachable from this environment (`download.kiwix.org`, `mirror.download.kiwix.org`, `library.kiwix.org`, `get.kiwix.org`, `kiwix.org`, `hub.kiwix.org`, `wiki.openzim.org`, `download.openzim.org`, `api.farm.openzim.org`, `dumps.wikimedia.org`, the `ftp.fau.de` and `accum.se` mirrors, and `web.archive.org`). The GitHub source and the npm registry could be reached. So the code, API and Docker facts below come from primary sources. **The current file sizes and publishing dates do not**, and are marked _unverified_.

## Answer in brief

- **The files.** English Wikipedia comes in `maxi` (everything except video and audio), `nopic` and `mini` (the intro and infobox only), plus topic subsets. The last maxi size I could find is 111 GB (August 2025, a secondary source). There is no 2026 figure I could check.
- **What's inside.** Each ZIM holds the rendered HTML, images, metadata, a title index and a Xapian full-text index. libzim's source shows where each one lives.
- **Getting them.** Direct HTTP, a torrent, a magnet link or a Metalink. The OPDS catalog lists all of these. Updates are a full new file each time; there are no incremental updates.
- **`@openzim/libzim` 4.7.0** (5 Oct 2026) supports Node 22, 24 and 26 on Linux (x64, arm64, armhf) and macOS (Intel and Apple Silicon). Only the libzim library itself is prebuilt. The Node addon is compiled on `npm install`, so the Docker image needs a C++ toolchain, glibc and access to `download.openzim.org`. It has full-text search, title suggestions and geo search, but reads and searches are **synchronous** and block Node's event loop.
- **Browser over HTTP range requests: no, not supported.** kiwix-js reads only local files. Its maintainers closed the remote-reading request in 2022 and said in June 2025 they have no plans for it because it is too slow.
- **kiwix-serve** (in kiwix-tools 3.8.2, on libkiwix 14.2.x) already serves content, search, suggestions, OPDS and raw entries, with range requests, ETags and cache headers. It has **no authentication**. The official image is `ghcr.io/kiwix/kiwix-serve` and listens on port 8080.

## 1. Wikipedia ZIM flavours and sizes

| Flavour | Meaning | Source |
| --- | --- | --- |
| `maxi` | "Everything except video and audio" (mwoffliner `--format=novid:maxi`) | [mwoffliner README](https://github.com/openzim/mwoffliner/blob/main/README.md) |
| `nopic` | "No pictures, no video, no audio" (`--format=nopic:nopic`). Kiwix says about 75% smaller than maxi. | mwoffliner README; Kiwix FAQ via search snippet ([get.kiwix.org FAQ](https://get.kiwix.org/en/faq-items/what-do-mini-nopic-and-maxi-mean-in-the-wikipedia-zim-files/), not fetched) |
| `mini` | "Head paragraphs only, no media at all" (`--format=nodet,nopic:mini`). Kiwix says intro plus infobox, about 95% smaller. | mwoffliner README; Kiwix FAQ (as above) |

Files are named `wikipedia_<lang>_<selection>_<flavour>_<YYYY-MM>.zim`, for example `wikipedia_en_all_maxi_2025-08.zim`. `all` is every article. Other selections include `top` (most-read articles) and topic sets such as `medicine`. With `--nodatealiases`, kiwix-serve also serves a file under its name without the date (`wikipedia_en_all`) ([kiwix-serve docs](https://github.com/kiwix/kiwix-tools/blob/main/docs/kiwix-serve.rst)).

**English sizes (_unverified_: secondary sources only, because the download listing was unreachable):**

| File | Size | Source |
| --- | --- | --- |
| `wikipedia_en_all_maxi_2025-08` | 111 GB | [netjeff.com blog](https://www.netjeff.com/wp/?p=1440) |
| `wikipedia_en_all_maxi_2023-11` | 101.6 GiB | [nelsonslog](https://nelsonslog.wordpress.com/2024/01/05/kiwix-libraries-for-offline-wikipedia/) |
| `wikipedia_en_all_maxi_2023-05` / `nopic_2023-06` | 100.47 GB / 53.9 GB | Kiwix wiki "Content" page, via search snippet only |

The maxi file grows by roughly 5 GB a year. Plan for about 115 GB for a 2026 maxi and about 60 GB for nopic, but take the real figures from the listing or the catalog. The sizes of the mini, top and medicine files, and the other languages, could not be checked.

**Other languages.** The same flavours are built for every Wikipedia language. The Zimfarm runs "almost 1,200 recipes" and about "5,000 updates per month" (Kiwix blog via search snippet: [hub.kiwix.org, 2020](https://hub.kiwix.org/weblog/2020/8/a-short-history-of-farming/), not fetched).

## 2. How often, and how to download

- **Cadence (_partly verified_).** Kiwix's June 2025 post says about 99% of Wikipedia ZIM files were back on a monthly schedule. It also says a 7-million-entry ZIM (English) takes 6 to 20 days to crawl and build ([hub.kiwix.org, 2025-06](https://hub.kiwix.org/weblog/2025/6/an-update-on-the-offline-wikipedia-update/), search snippet; the page was unreachable). In practice, the English maxi has appeared every few months. Each update is a full rebuild, with no incremental updates ([Kiwix FAQ](https://get.kiwix.org/en/faq-items/can-i-update-zim-files-incrementally/), snippet).
- **Methods (verified in libkiwix code).** An OPDS catalog entry can carry four kinds of acquisition link, by MIME type: `application/x-zim` (direct HTTP), `application/x-bittorrent`, `application/x-magnet` and `application/metalink4+xml` (Metalink, which lists the mirrors). Each link has a byte `length` ([libkiwix `src/book.cpp`](https://github.com/kiwix/libkiwix/blob/main/src/book.cpp)). Kiwix recommends the torrent for large files (Kiwix announcement, snippet).
- **OPDS catalog API (verified in the docs).** `library.kiwix.org` runs kiwix-serve's catalog. `/catalog/v2/entries` filters by `lang`, `category`, `tag`, `notag`, `maxsize`, `q` and `name`, and pages with `start` and `count`. `/catalog/v2/entry/<uuid>`, `/languages` and `/categories` also exist ([kiwix-serve docs](https://github.com/kiwix/kiwix-tools/blob/main/docs/kiwix-serve.rst)). An installer could use this to offer "pick a language and size" without hard-coding URLs. _Unverified:_ that library.kiwix.org currently serves exactly this API (it was unreachable).
- **Mirrors.** `download.kiwix.org` hands requests to mirrors. Mirrors in the snippets include `archive.download.kiwix.org` (older files) and `lb.download.kiwix.org`. All of them were unreachable from here.

## 3. What a ZIM file holds

Verified in libzim's source:

- **User content** (`C` namespace): the rendered article HTML, images (mwoffliner converts them to WebP), CSS and JS. A path is looked up with a binary search over sorted directory entries ([`src/fileimpl.cpp`](https://github.com/openzim/libzim/blob/main/src/fileimpl.cpp)).
- **Metadata** (`M` namespace): title, language, description, illustrations (favicons) and so on. The binding exposes them as `getMetadata(name)` and `metadataKeys`.
- **Title index:** `X/title/xapian`. When it is missing, suggestions fall back to a prefix search over the title-ordered list (`X/listing/titleOrdered/v1`, `findByTitle`) ([`src/suggestion.cpp`](https://github.com/openzim/libzim/blob/main/src/suggestion.cpp)).
- **Full-text index:** `X/fulltext/xapian` (older files used `Z/fulltextIndex/xapian`). It is a Xapian database stored inside the ZIM, which libzim opens in place. Xapian is an optional build dependency; without it, all search APIs disappear ([libzim README](https://github.com/openzim/libzim/blob/main/README.md)).
- **Compression and integrity:** content is stored in compressed clusters (zstd for new files), and there is an MD5 checksum in the header. Split files (`.zimaa`, `.zimab` and so on) are opened as one archive (`openSinglePieceOrSplitZimFile`).
- **Read-only.** A ZIM cannot be changed after it is made.

## 4. `@openzim/libzim` (node-libzim)

All verified from the npm package `@openzim/libzim@4.7.0` (tarball, `package.json`, `Changelog`, `download-libzim.js`, `binding.gyp`, `dist/index.d.ts`) and its [CI workflow](https://github.com/openzim/node-libzim/blob/main/.github/workflows/ci.yml):

| Question | Answer |
| --- | --- |
| Latest | 4.7.0, published 2026-10-05, bundles libzim 9.8.2-1. Releases come about monthly (4.0.0 Dec 2025 to 4.7.0 Oct 2026). License GPL-3.0. |
| Node 26 | Yes. `engines: node >=22 <27`. 4.3.0 (June 2026) "drop Node.JS 20, add Node.JS 26". CI tests Node 22, 24 and 26. |
| Linux | Yes: x64, arm64 (`aarch64-manylinux`) and armhf. CI runs on Ubuntu 22.04, 24.04 and 26.04, on x64 and ARM. |
| macOS | Yes: Intel and Apple Silicon. CI runs on macOS 15 and 26, both Intel and ARM. |
| Windows | No prebuilt library. You must install libzim yourself. |
| Prebuilt binaries | **Only libzim itself.** The `install` script downloads `https://download.openzim.org/release/libzim/libzim_<os>-<arch>-9.8.2-1.tar.gz`, then **runs `node-gyp rebuild`** to compile the addon. There is no prebuilt `.node` file. |
| Docker | Works on a glibc image (for example `node:26-bookworm`) with `python3`, `make` and `g++` present at install time, and network access to `download.openzim.org`. A multi-stage build can leave the toolchain out of the final image. Alpine (musl) is unlikely to work with the manylinux/glibc `.so` (_inferred, not tested_). The binding can also link against a system libzim (`libzim_local` in `binding.gyp`). |
| ESM / types | Ships `dist/index.js` (ESM) and `dist/index.d.ts`. |

**Read API** (`index.d.ts`):

- `new Archive(path, openConfig?)`, with `getEntryByPath`, `getEntryByTitle`, `hasEntryByPath`, `mainEntry`, `randomEntry`, `iterByPath`, `iterByTitle`, `findByPath(prefix)`, `findByTitle(prefix)`, `articleCount`, `mediaCount`, `getMetadata`, `getIllustrationItem`, `hasFulltextIndex()`, `hasTitleIndex()`, `checkIntegrity`, plus dirent and cluster cache controls.
- `Entry` (has `isRedirect`, `redirectEntry`, `getItem(followRedirect)`) leads to an `Item` with `mimetype`, `size`, `data` and `getData(offset, limit)`. `getData` returns a byte range, so large media can be streamed or served in ranges. `directAccessInformation` gives the file name and offset of uncompressed content.
- **Full-text search:** `new Searcher(archive | archive[])` then `.search(new Query(q))` returns a `Search` with `estimatedMatches` and `getResults(start, n)`. Each result has `path`, `title`, `score`, `snippet` and `wordCount`. It can search across several archives, and `Query.setGeorange(lat, lon, distance)` searches by location.
- **Title suggestions:** `new SuggestionSearcher(archive).suggest(q).getResults(start, n)`, with a `snippet` on each result.
- `OpenConfig.preloadXapianDb()` and `preloadDirentRanges()` speed up the first lookups.
- **Blocking:** only `Creator` (writing) uses `Napi::AsyncWorker`. Reads and searches are synchronous C++ calls (seen in `src/*.h`). A server should run search in a `worker_thread` pool or accept the event-loop stall.

Not tested here: installing it on Node 26.12 (the version in this environment). The download from `download.openzim.org` is blocked here, so a real install has to be checked in a spike.

## 5. Can a browser read a ZIM over HTTP range requests?

**Not with any supported Kiwix tool.**

- kiwix-js reads only files on the device: the file picker, the File System Access API (Chromium 122 and later, which can remember permission), `webkitdirectory`, drag and drop, and experimental OPFS builds. The README says archives "must be available on the machine where the browser is running or via a network mount" and points to kiwix-serve for network use. Pages are served from the ZIM by a Service Worker. Full-text search uses `openzim/javascript-libzim` (libzim compiled to WASM) and needs browsers with Atomics ([kiwix-js README](https://github.com/kiwix/kiwix-js/blob/main/README.md)).
- Issue [#659 "Online Preview (ZIM reading over HTTP)"](https://github.com/kiwix/kiwix-js/issues/659) was closed in Nov 2022. On 2025-06-16 a maintainer wrote: "we don't have any plans to enable reading remote ZIMs with JavaScript because it isn't performant to fetch multiple file slices over the Internet." Earlier comments: the server must accept `Range`, and a precomputed index might be needed. Issue [#356](https://github.com/kiwix/kiwix-js/issues/356) shows a 2018 unmerged branch that read a 16 GB Spanish ZIM over XHR range requests on a LAN. So it is technically possible, but nobody maintains it.
- `javascript-libzim` mounts a local `File` through Emscripten's WORKERFS inside a Web Worker. Its README mentions no HTTP or remote backend, and it calls itself a pre-1.0 prototype with an unstable API ([README](https://github.com/openzim/javascript-libzim/blob/main/README.md)).

Why it is slow (_inferred from the format_): each article read needs a binary search over the directory entries, then fetching and decompressing a whole cluster. Over a WAN, that is several round trips per page, and Xapian search would need many more. For our offline goal, it is better for the server to serve articles and the client to cache them (sections 4 and 6). Range reads only make sense on a LAN or for a locally saved file.

## 6. kiwix-serve (libkiwix) compared

Verified from the [kiwix-serve docs](https://github.com/kiwix/kiwix-tools/blob/main/docs/kiwix-serve.rst), the [Docker files](https://github.com/kiwix/kiwix-tools/tree/main/docker/server) and libkiwix [`src/server/response.cpp`](https://github.com/kiwix/libkiwix/blob/main/src/server/response.cpp):

- **Versions:** kiwix-tools 3.8.2 is the latest, released 2 Mar. libkiwix 14.2.1 is the latest, released 11 May. GitHub showed these dates without a year; they are most likely 2026. Licensed GPL-3.0+.
- **Public, stable API:** the OPDS catalog (`/catalog/v2/...`), `/raw/<book>/content/<path>` (an entry untouched), `/raw/<book>/meta/<name>`, and `/search`. Search takes `pattern`, `books.name` or `books.id` (repeatable, so it can search several ZIMs), geo parameters, `pageLength` (max 140) and `start`, and returns `format=html|xml`. The docs mark everything else as private ("comes without any guarantees"): `/content/...`, `/suggest` (JSON), `/viewer#...`, `/random` and `/skin`.
- **HTTP behaviour:** `Accept-Ranges: bytes`, 206 and 416 responses, ETags and 304s, and `Cache-Control: max-age=3600, must-revalidate` for ZIM content.
- **Options:** `--library` (an XML or OPDS library file), `-M/--monitorLibrary` (reload when that file changes; SIGHUP also reloads), `-r/--urlRootLocation` (serve under a path prefix), `-b/--blockexternal`, `-n/--nosearchbar`, `-m/--nolibrarybutton`, `-c/--customIndex`, `-t/--threads` (default 4), `-s/--searchLimit`, `-L/--ipConnectionLimit`, `--catalogOnly`, and `-z/--nodatealiases`.
- **Auth:** none. The only access control is the per-IP connection limit. For VoidAuth it would have to sit behind a forward-auth proxy.
- **Docker:** `ghcr.io/kiwix/kiwix-serve`, built on `ghcr.io/kiwix/kiwix-tools` (images for `linux/amd64`, `arm64` and `arm/v7`). It listens on `PORT`, default 8080, serves the `/data` volume, and runs as an unprivileged user (UID 1001) under `dumb-init`. `DOWNLOAD=<url>` fetches a ZIM with `wget` on start. Example: `docker run -v /zim:/data -p 8080:8080 ghcr.io/kiwix/kiwix-serve '*.zim'`.
- **Correction to the first survey:** it said kiwix-serve "picks up new ZIM files without a restart". The docs only promise that for a library file (`-M` or SIGHUP), not for a folder of files or a glob.

|  | Our app on `@openzim/libzim` | kiwix-serve |
| --- | --- | --- |
| Sign-in | Ours (VoidAuth OIDC) | None; a proxy would have to add it |
| UI | Ours | Kiwix viewer and toolbar |
| Search | `Searcher` and `SuggestionSearcher` (blocking) | `/search` (stable), `/suggest` (private) |
| Raw entries and ranges | Through `Item.getData(offset, limit)` | `/raw` with 206 responses |
| Multiple ZIMs | `Searcher([a, b])` | `books.name=` repeated |
| Install | node-gyp toolchain plus libzim download | One container |
| License effect | Our server code links GPL code | Separate process, no linking |

## Not verified

- Current (2026) English sizes for maxi, nopic, mini, top and medicine, the latest file dates, and other languages' sizes. Check `download.kiwix.org/zim/wikipedia/` or `library.kiwix.org/catalog/v2/entries?lang=eng&name=wikipedia_en_all` from a normal network.
- The current Zimfarm cadence for English, and the mirror list or `.torrent` URL pattern on the download site.
- That `@openzim/libzim` actually installs and runs on Node 26.12 here (the libzim download was blocked), and on Alpine.
- The year of the kiwix-tools 3.8.2 and libkiwix 14.2.1 releases.
