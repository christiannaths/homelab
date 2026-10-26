# Gateway

The one way into every app ([ADR-PLAT-004](../../docs/adr/ADR-PLAT-004-sign-in.md)). It is Caddy, built with the homelab's own module, and it does two things for every app's site:

- **The sign-in check** ([`signed-in.caddyfile`](signed-in.caddyfile)): it asks the [accounts service](../accounts/README.md) about each request and passes the person on in `Remote-*` headers, which apps trust. The service is `accounts:3000`, or `ACCOUNTS_UPSTREAM`. [`@homelab/identity`](../../packages/identity/src/identity.ts) writes them in the accounts service and reads them in an app's server.
- **The App switcher** ([`switcher.caddyfile`](switcher.caddyfile)): it puts the whole [App switcher](../app-switcher/README.md) inline into every page passing through, so no app installs anything for it. The accounts site imports it too.

## The image

[`Dockerfile`](Dockerfile) builds the gateway from this checkout: it builds the App switcher, then Caddy 2.10.2 with the module in [`caddy/`](caddy), which has the built switcher inside it, and puts both snippets in `/etc/caddy/`. Every version in it is pinned (images by digest, Go modules in `caddy/go.sum`), so a build is reproducible. Dev (`tools/dev/`), the platform's end-to-end stack and the preview image ([`tools/preview/Dockerfile`](../../tools/preview/Dockerfile), which builds the same gateway into one image) all run it.

```sh
docker build -f platform/gateway/Dockerfile .   # from the repository root
```

Behind a proxy that intercepts TLS, pass its CA with `--secret id=ca-certs,src=<the CA's PEM file>`. The compose files pass `NODE_EXTRA_CA_CERTS` that way when it is set.

## Adding an app

An app's site imports both snippets, in this order, before whatever answers for the app:

```caddyfile
notes.{$SITE_DOMAIN} {
	route {
		import /etc/caddy/signed-in.caddyfile
		import /etc/caddy/switcher.caddyfile
		reverse_proxy notes:3000
	}
}
```

## What the switcher's module changes

`homelab_switcher` (in [`caddy/switcher`](caddy/switcher)) changes HTML pages and nothing else:

- It puts `<script>…the switcher…</script>` before the page's last `</body>`. Only a fetch for a whole page counts (`Sec-Fetch-Dest: document`, `empty` or none), so a page in a frame or an `<object>` is left alone. That includes an offline-first app's service worker saving its page (`Sec-Fetch-Dest: empty`), so an app opened offline shows the switcher too. An HTML download (`Content-Disposition: attachment`) is left alone.
- When the page limits scripts, in a `Content-Security-Policy` header (or `-Report-Only`) or a CSP `<meta>`, it adds the switcher's hash to the list that limits script elements (`script-src-elem`, else `script-src`, else a new `script-src` from `default-src`), `*.<parent domain>` to the lists for requests and images, so the switcher can ask Home and show icons, and `data:` to the list for images, for the icons it keeps for offline. A list that already lets every inline script run (`'unsafe-inline'` with no hash, nonce or `'strict-dynamic'`) is left alone, and a page with no limit gets no policy. Nothing is set per app.
- It drops the page's `ETag` and `Last-Modified`, so a browser never revalidates its way into keeping an old switcher.
- It asks upstreams for anything that could be a page without the browser's `Accept-Encoding`, so Caddy's proxy asks for gzip and undoes it itself, and `encode` compresses the page again for the browser. A page compressed some other way anyway passes through as it is, without the switcher.
- Other answers (scripts, styles, images, API answers, downloads, redirects) pass through untouched, and scripts, styles and images come compressed as the app sent them.

## Testing

```sh
npm run e2e -w @homelab/gateway   # builds the image and runs it alone, with Docker
```

The tests in [`test/`](test) run the image in front of stand-ins: the sign-in check against a stand-in for the accounts service, and the switcher against an app that answers with pages, other files and compressed pages. The module's own Go tests run in the image build.
