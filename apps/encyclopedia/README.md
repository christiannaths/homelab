# Encyclopedia

A read-only copy of Wikipedia for the homelab, already populated. Readers sign in with their homelab account, read and search articles, and keep saved lists that work offline.

The `encyclopedia` app in the [homelab monorepo](../../README.md).

> Status: **title page only.** [`web/`](web) is an installable PWA that opens offline and shows a title page, with the App switcher in its header, so signing in and out can be tried across apps on one domain. Reading, search and saved lists are not built yet. The app will be built against:
>
> - [`docs/adr/`](docs/adr/README.md): the Encyclopedia ADRs, including what is deliberately _not_ decided yet, plus the [platform ADRs](../../docs/adr/README.md)
> - [`docs/specs/`](docs/specs/README.md): the feature specs
> - [`docs/research/`](docs/research): the open source survey, ZIM and libzim facts, and the licensing findings

Content comes from Wikipedia under CC BY-SA 4.0, through Kiwix's ZIM files. Wikipedia is a trademark of the Wikimedia Foundation; this project is not affiliated with or endorsed by it.
