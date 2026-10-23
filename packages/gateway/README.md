# Gateway

The one way into every app ([ADR-PLAT-004](../../docs/adr/ADR-PLAT-004-sign-in.md)). It is Caddy, built with the homelab's own module, and it does two things for every app's site:

- **The sign-in check** ([`signed-in.caddyfile`](signed-in.caddyfile)): it asks VoidAuth about each request and passes the person on in `Remote-*` headers, which apps trust. [`src/identity.ts`](src/identity.ts) reads them in an app's server.
- **The App switcher** ([`switcher.caddyfile`](switcher.caddyfile)): it puts the whole [App switcher](../app-switcher/README.md) inline into every page passing through, so no app installs anything for it.

## The image

[`Dockerfile`](Dockerfile) builds the gateway from this checkout: it builds the App switcher, then Caddy 2.10.2 with the module in [`caddy/`](caddy), which has the built switcher inside it, and puts both snippets in `/etc/caddy/`. Every version in it is pinned (images by digest, Go modules in `caddy/go.sum`), so a build is reproducible. Dev (`tools/dev/`), the Home and Notes end-to-end stacks and the preview image ([`tools/preview/Dockerfile`](../../tools/preview/Dockerfile), which builds the same gateway into one image) all run it.

```sh
docker build -f packages/gateway/Dockerfile .   # from the repository root
```

Behind a proxy that intercepts TLS, pass its CA with `--secret id=ca-certs,src=<the CA's PEM file>`. The compose files pass `NODE_EXTRA_CA_CERTS` that way when it is set.

## Adding an app

An app's site imports both snippets, in this order, before whatever answers for the app:

```caddyfile
notes.{$HOMELAB_DOMAIN} {
	route {
		import /etc/caddy/signed-in.caddyfile
		import /etc/caddy/switcher.caddyfile
		reverse_proxy notes:3000
	}
}
```

## What the switcher's module changes

`homelab_switcher` (in [`caddy/switcher`](caddy/switcher)) changes HTML pages and nothing else:

- It puts `<script>…the switcher…</script>` before the page's last `</body>`. A page whose request says it goes in a frame (`Sec-Fetch-Dest: iframe` or `frame`) is left alone. Every other fetch of a page counts, including an offline-first app's service worker saving its page (`Sec-Fetch-Dest: empty`), so an app opened offline shows the switcher too.
- It drops the page's `ETag` and `Last-Modified`, so a browser never revalidates its way into keeping an old switcher.
- It asks upstreams for pages without the browser's `Accept-Encoding`, so Caddy's proxy asks for gzip and undoes it itself, and `encode` compresses the page again for the browser. A page compressed some other way anyway passes through as it is, without the switcher.
- Other answers (scripts, styles, images, API answers, downloads, redirects) pass through untouched.

## Testing

```sh
npm run e2e -w @homelab/gateway   # builds the image and runs it alone, with Docker
```

The tests in [`test/`](test) run the image in front of stand-ins: the sign-in check against a stand-in for VoidAuth, and the switcher against an app that answers with pages, other files and compressed pages. The module's own Go tests run in the image build.
