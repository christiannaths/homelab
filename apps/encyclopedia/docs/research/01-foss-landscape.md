# Open source for a pre-populated Wikipedia clone

Date: 2026-10-18. Research only. The decisions it led to are in the [ADR index](../adr/README.md).

The ask: the homelab's second app, a Wikipedia clone that comes already filled with Wikipedia's content. This surveys what open source already exists and how each option fits the homelab's rules (anyone can install it with their own settings, one VoidAuth sign-in for every app, offline-first).

## Verdict

**The content problem is solved; the app is not.** The Kiwix/openZIM project already turns Wikipedia into ready-to-serve archive files (ZIM), refreshed regularly, in every language and in full, text-only and intro-only sizes. Nobody ships a self-hosted Wikipedia _app_ that fits our rules: the existing readers have no accounts, no per-user features, and their own look.

So the likely shape is: **use Kiwix's ZIM files as the data, read them with openZIM's own library (`@openzim/libzim`, which has Node bindings and full-text search), and build our own app and UI around them.** `kiwix-serve` can be the quick first version or a fallback.

The one question that changes this: **does the clone need editing?** If people should be able to edit articles like on Wikipedia, ZIM files are read-only and the answer becomes MediaWiki (the software Wikipedia itself runs), which is far heavier to install and fill.

## The options

### 1. Kiwix: ready-made offline Wikipedia (read-only)

Kiwix is the established project for offline Wikipedia (used in schools, prisons, ships, Antarctica). It has three pieces:

| Piece | What it does | License |
| --- | --- | --- |
| **ZIM files** (made by `mwoffliner`) | Each is one compressed file holding a whole wiki: articles, images, a search index. Kiwix publishes them for Wikipedia in every language, plus Wiktionary, Stack Exchange, Gutenberg and more. | Content is CC BY-SA |
| **kiwix-serve** | A small server that serves a folder of ZIM files as browsable, searchable websites, with an OPDS catalog. Official Docker image `ghcr.io/kiwix/kiwix-serve`. Picks up new ZIM files without a restart only when they're listed in a library file (`-M` or SIGHUP), not by watching a folder. | GPL-3.0+ |
| **kiwix-js / Kiwix PWA** | A ZIM reader written in JavaScript that runs as an installable, offline-first web app. A service worker serves pages straight out of a ZIM file the user picks on their own device. | GPL-3.0 |

Under all of them is **libzim**, the C++ library that reads and writes ZIM files. **`@openzim/libzim`** is its Node.js binding: it reads and writes ZIM files and does full-text search and title suggestions. That is the piece that would let a TypeScript app in our monorepo serve articles itself.

**Sizes for English Wikipedia** (approximate; Kiwix's download site wasn't reachable from here, so these come from secondary sources):

| Flavour | Contents | Size |
| --- | --- | --- |
| maxi | Every article, with images | about 100 to 110 GB (103 GB in Oct 2023; about 108 GB reported May 2025) |
| nopic | Every article, no images | about 55 to 60 GB (Kiwix says about 75% smaller) |
| mini | Intro and infobox of each article | about 95% smaller than maxi |

Kiwix also publishes topic subsets (for example medicine, and a "top" selection of the most-read articles) and every other language. Smaller files make good defaults and test data.

**Fit:**

- _Pre-populated:_ Yes, the best of all options. Download one file and it works. Updates mean swapping in a newer file.
- _Bring your own settings:_ Good. The installer picks the language and size; nothing is baked into the repo.
- _VoidAuth sign-in:_ kiwix-serve has no accounts at all. It would have to sit behind the homelab's sign-in at the proxy, with no per-user features. Our own app on libzim gets sign-in like any other homelab app.
- _Offline-first:_ The Kiwix PWA proves a browser can read a ZIM file with no network. But a 100 GB file can't be cached by a web app the normal way; offline means either the user keeps a copy of the file on their device (as the Kiwix PWA does), or we cache a chosen set of articles. This is the hardest design question for this app.
- _Editing:_ None. ZIM files are read-only snapshots.

### 2. MediaWiki: the real Wikipedia software (editable)

MediaWiki is what Wikipedia runs on (PHP, MySQL or MariaDB). Filling it means importing Wikimedia's XML dump with the `importDump` maintenance script (the older MWDumper tool can't read current dumps).

- _Data:_ The English current-articles dump (`pages-articles-multistream.xml.bz2`) was about 26.2 GB compressed in April 2026. It has wikitext only: no images, no search index. Expect a database several times that size; one 2019 report of a full English import on a Raspberry Pi took months and produced a 290 GB database. Articles also depend on thousands of templates, Lua modules and extensions to render like Wikipedia does.
- _VoidAuth sign-in:_ Possible with the **OpenID Connect** extension (MIT, v8.3.0, Feb 2025) on top of **PluggableAuth** (v7.5.0, Apr 2025). Turning off local login sends everyone straight to the single sign-on.
- _Offline-first:_ None; it's a classic server-rendered site.
- _Fit with the monorepo:_ Poor. A PHP stack beside our TypeScript apps, and a long, fragile import for every installer.

Worth it only if editing (and article history, talk pages) is the point.

### 3. Raw Wikipedia data to build on directly

If we want our own storage instead of ZIM files:

| Source | Format | Notes |
| --- | --- | --- |
| Wikimedia XML dumps (dumps.wikimedia.org) | Wikitext | Twice monthly. Needs a wikitext-to-HTML renderer, which is the hard part. |
| Wikimedia Enterprise HTML snapshots | Rendered HTML, as readers see it | Free for some wikis via Wikimedia Enterprise. |
| `wikimedia/structured-wikipedia` on Hugging Face | JSON per article (sections, infobox, plain text) | Beta, English and French, about 17.9 GB zipped for English. Strips references and non-prose sections. |
| `wikimedia/wikipedia` on Hugging Face | Cleaned plain text per article | Built from the Enterprise HTML snapshots. Text only. |

These suit a search index, a custom data model or AI features, but rebuild work Kiwix has already done.

### 4. Not a fit

- **Wiki.js, BookStack, Outline, Docmost:** good self-hosted wikis with OIDC, but for writing your own docs. None imports Wikipedia, and Notes already covers that ground.
- **XOWA:** a desktop offline Wikipedia app (Java). Listed as discontinued; I could only find third-party mirrors of its code, not the upstream repo, so its status is unconfirmed.
- **Okawix, WikiTaxi, Aard:** older or desktop/Android readers. Okawix is listed as discontinued.
- **Wikiless:** a privacy front end for the live Wikipedia, not an offline copy.

## Licensing

- **Wikipedia's text** is CC BY-SA 4.0 (and GFDL). Anyone redistributing it must credit Wikipedia's contributors and keep the same license. Showing a source link and license notice on each article covers it.
- **Images** are licensed one by one, many not under CC BY-SA. The maxi ZIM files carry them as Kiwix packaged them; we'd show attribution rather than relicense.
- **Kiwix code and `@openzim/libzim` are GPL-3.0.** If our app bundles or links them, the parts that do are GPL too. Using ZIM files as data, or running kiwix-serve as a separate service, doesn't carry that requirement. The homelab repo has no license file yet, so this is worth settling before choosing.

## Questions to settle

All settled on 2026-10-18; see the [ADR index](../adr/README.md).

## Sources

- [kiwix/kiwix-tools](https://github.com/kiwix/kiwix-tools) (kiwix-serve, license, Docker images)
- [kiwix/kiwix-js](https://github.com/kiwix/kiwix-js) (offline-first PWA, service worker, File System Access)
- [openzim/node-libzim](https://github.com/openzim/node-libzim) (`@openzim/libzim`, read/write/search)
- [openzim/mwoffliner](https://github.com/openzim/mwoffliner) (makes ZIM files from any MediaWiki)
- [Kiwix FAQ](https://legacydev.kiwix.org/en/?p=41) (maxi, nopic and mini flavours)
- [Hacker News: Kiwix file sizes](https://news.ycombinator.com/item?id=38512781) and [Kiwix libraries for offline Wikipedia](https://nelsonslog.wordpress.com/2024/01/05/kiwix-libraries-for-offline-wikipedia/) (English maxi sizes)
- [Big Iron: Kiwix and ZIM](https://www.bigiron.cc/guides/kiwix-and-zim-offline-mirrors-of-wikipedia-and-stack-exchange) and [Backing up Wikipedia with Kiwix](https://sarah-robin.com/blog/digital-resilience-backup-kiwix) (nopic and 2025 sizes)
- [Meta-Wiki: Data dump torrents](https://meta.wikimedia.org/wiki/Data_dump_torrents/lt) (English dump sizes, 2025 to 2026)
- [Import Wikipedia into MySQL](https://raw.org/software/databases/import-wikipedia-into-mysql/) (importDump, MWDumper limits, import effort)
- [Extension:OpenID Connect](https://www.mediawiki.org/wiki/Extension:OpenID_Connect) and [Extension:PluggableAuth](https://www.mediawiki.org/wiki/Extension:PluggableAuth/en)
- [Wikimedia dumps license](https://download.wikipedia.com/legal.html) and [Wikimedia Downloads](https://download.wikipedia.com)
- [Wikimedia Enterprise: Hugging Face dataset](https://enterprise.wikimedia.com/blog/hugging-face-dataset/)
- [AlternativeTo: Kiwix alternatives](https://www.alternativeto.net/software/kiwix/) (XOWA, Okawix, Wikiless status)
- [Wiki.js vs BookStack](https://selfhosting.sh/compare/bookstack-vs-wiki-js/)
