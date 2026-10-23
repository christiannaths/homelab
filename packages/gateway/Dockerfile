# The homelab gateway (ADR-PLAT-004): Caddy 2.10.2 built with the App switcher's module
# (caddy/switcher), with the built switcher inside it and the snippets every site imports in
# /etc/caddy/. Built from the repository root:
#
#   docker build -f packages/gateway/Dockerfile .
#
# Behind a proxy that intercepts TLS, also pass its CA so npm and Go trust it:
# --secret id=ca-certs,src=<the CA's PEM file>.
#
# tools/preview/Dockerfile builds the same gateway into the preview image; update them together.
FROM node:26-alpine@sha256:6f08a523443ddedf52941874c203475b0ad503e859ad70cb26ab8be9a517dbd5 AS switcher
WORKDIR /repo
COPY package.json package-lock.json tsconfig.shared.json ./
COPY packages/theme packages/theme
COPY packages/app-switcher packages/app-switcher
RUN --mount=type=secret,id=ca-certs \
  if [ -s /run/secrets/ca-certs ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca-certs; fi \
  && npm ci --no-audit --no-fund --ignore-scripts -w @homelab/app-switcher \
  && npm run build -w @homelab/app-switcher

FROM caddy:2.10.2-builder@sha256:01668408cc26e2e00c9d067c30cb43b2ba14ad1f2808beda55503cb2a31f59dc AS caddy
WORKDIR /src
COPY packages/gateway/caddy/go.mod packages/gateway/caddy/go.sum ./
RUN --mount=type=secret,id=ca-certs \
  if [ -s /run/secrets/ca-certs ]; then export SSL_CERT_FILE=/run/secrets/ca-certs; fi \
  && go mod download
COPY packages/gateway/caddy ./
COPY --from=switcher /repo/packages/app-switcher/dist/switcher.js switcher/switcher.js
RUN go vet ./... && go test ./... \
  && CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o /usr/bin/caddy .

FROM caddy:2.10.2@sha256:c3d7ee5d2b11f9dc54f947f68a734c84e9c9666c92c88a7f30b9cba5da182adb
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY packages/gateway/signed-in.caddyfile packages/gateway/switcher.caddyfile /etc/caddy/
