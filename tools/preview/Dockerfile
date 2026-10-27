# syntax=docker/dockerfile:1
# The preview image (ADR-PLAT-008): the whole homelab in one container, run by start.ts. Built from
# the repository root:
#
#   docker build -f tools/preview/Dockerfile .
#
# Behind a proxy that intercepts TLS, also pass its CA so npm trusts it:
# --secret id=ca-certs,src=<the CA's PEM file>.
#
# The gateway is built as in platform/gateway/Dockerfile; update them together.
FROM node:26-alpine@sha256:6f08a523443ddedf52941874c203475b0ad503e859ad70cb26ab8be9a517dbd5 AS web
WORKDIR /repo
# The package files come first, so a change that leaves dependencies alone reuses the installed ones.
COPY --parents package.json package-lock.json apps/*/*/package.json platform/*/package.json \
  packages/*/package.json spikes/*/*/package.json tools/package.json ./
RUN --mount=type=secret,id=ca-certs \
  if [ -f /run/secrets/ca-certs ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca-certs; fi \
  && npm ci --no-audit --no-fund
COPY . .
RUN npm run build -w @homelab/app-switcher -w @homelab/notes-web -w @homelab/encyclopedia-web

FROM caddy:2.10.2-builder@sha256:01668408cc26e2e00c9d067c30cb43b2ba14ad1f2808beda55503cb2a31f59dc AS gateway
WORKDIR /src
COPY platform/gateway/caddy/go.mod platform/gateway/caddy/go.sum ./
RUN --mount=type=secret,id=ca-certs \
  if [ -s /run/secrets/ca-certs ]; then export SSL_CERT_FILE=/run/secrets/ca-certs; fi \
  && go mod download
COPY platform/gateway/caddy ./
COPY --from=web /repo/platform/app-switcher/dist/switcher.js switcher/switcher.js
RUN go test ./... && CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o /usr/bin/caddy .

FROM node:26-alpine@sha256:6f08a523443ddedf52941874c203475b0ad503e859ad70cb26ab8be9a517dbd5
COPY --from=gateway /usr/bin/caddy /usr/bin/caddy

WORKDIR /repo
COPY --parents package.json package-lock.json apps/*/*/package.json platform/*/package.json \
  packages/*/package.json spikes/*/*/package.json tools/package.json ./
# Only what runs: the accounts service's and Notes' dependencies and the preview's scripts.
RUN --mount=type=secret,id=ca-certs \
  if [ -f /run/secrets/ca-certs ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca-certs; fi \
  && npm ci --no-audit --no-fund --omit=dev \
    -w @homelab/accounts -w @homelab/notes-server -w @homelab/tools \
  && npm cache clean --force
COPY . .
COPY --from=web /repo/apps/notes/web/dist apps/notes/web/dist
COPY --from=web /repo/apps/encyclopedia/web/dist /srv/encyclopedia
COPY tools/preview/Caddyfile /etc/caddy/Caddyfile
COPY platform/gateway/signed-in.caddyfile platform/gateway/switcher.caddyfile /etc/caddy/

ENV NODE_ENV=production
EXPOSE 8080
VOLUME /data
CMD ["node", "tools/preview/start.ts"]
