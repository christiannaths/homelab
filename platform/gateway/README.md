# Gateway

The one way into every app ([ADR-PLAT-004](../../docs/adr/ADR-PLAT-004-sign-in.md)): Caddy plus the homelab's module. Two snippets per app site:

| Snippet | Does |
| --- | --- |
| [`signed-in.caddyfile`](signed-in.caddyfile) | Asks the [accounts service](../accounts/README.md) (`accounts:3000`, or `ACCOUNTS_UPSTREAM`) about each request; passes the person in `Remote-*` headers ([`@homelab/identity`](../../packages/identity/src/identity.ts)) |
| [`switcher.caddyfile`](switcher.caddyfile) | Inlines the [App switcher](../app-switcher/README.md) into every page; the accounts site uses it too |

## The image

[`Dockerfile`](Dockerfile): builds the switcher, then Caddy 2.10.2 with [`caddy/`](caddy) (switcher embedded); snippets in `/etc/caddy/`. Everything pinned (images by digest, `caddy/go.sum`). Used by `tools/dev/`, `platform-e2e` and [`tools/preview`](../../tools/preview/Dockerfile).

```sh
docker build -f platform/gateway/Dockerfile .   # from the repository root
```

Behind a TLS-intercepting proxy: `--secret id=ca-certs,src=<the CA's PEM file>` (compose passes `NODE_EXTRA_CA_CERTS` this way when set).

## Adding an app

Import both snippets, in this order, before the upstream:

```caddyfile
notes.{$SITE_DOMAIN} {
	route {
		import /etc/caddy/signed-in.caddyfile
		import /etc/caddy/switcher.caddyfile
		reverse_proxy notes:3000
	}
}
```

## What `homelab_switcher` changes

[`caddy/switcher`](caddy/switcher) touches HTML pages only:

- **Inject** the script before the last `</body>`, only for whole-page fetches (`Sec-Fetch-Dest: document`, `empty` or none). `empty` covers a service worker caching its page, so offline opens get it. Frames, `<object>` and `Content-Disposition: attachment` are left alone.
- **CSP** (header, `-Report-Only`, or `<meta>`), only if the page limits scripts:

  | Adds | To |
  | --- | --- |
  | Script hash | `script-src-elem`, else `script-src`, else new `script-src` from `default-src` |
  | `*.<parent domain>` | request and image lists |
  | `data:` | image list (offline icons) |

  Lists already allowing all inline scripts (`'unsafe-inline'` with no hash, nonce or `'strict-dynamic'`) are untouched; no policy, none added. No per-app config.

- **Drop** `ETag` and `Last-Modified`, so browsers never revalidate into an old switcher.
- **Compression:** strips the browser's `Accept-Encoding` upstream for possible pages, so Caddy gets gzip and decodes it; `encode` recompresses. Pages compressed otherwise pass through without the switcher.
- Everything else passes untouched, compression included.

## Testing

```sh
npm run e2e -w @homelab/gateway   # builds the image and runs it alone, with Docker
```

[`test/`](test) runs the image against a stand-in accounts service and a stand-in app (pages, other files, compressed pages). The module's Go tests run in the image build.
