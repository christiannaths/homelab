# syntax=docker/dockerfile:1
# The preview image (ADR-PLAT-008): the whole homelab in one container, run by start.ts. Built from
# the repository root:
#
#   docker build -f tools/preview/Dockerfile .
#
# Behind a proxy that intercepts TLS, also pass its CA so npm trusts it:
# --secret id=ca-certs,src=<the CA's PEM file>.
#
# The VoidAuth and Caddy versions match tools/dev/compose.yaml; update them together.
FROM voidauth/voidauth:1.16.0@sha256:189ef16fe81f9de0753d1da610813465b2b09412506c2e96f1e0384ee2ca4a97 AS voidauth
FROM caddy:2.10.2@sha256:c3d7ee5d2b11f9dc54f947f68a734c84e9c9666c92c88a7f30b9cba5da182adb AS caddy

FROM node:26-alpine@sha256:6f08a523443ddedf52941874c203475b0ad503e859ad70cb26ab8be9a517dbd5 AS web
WORKDIR /repo
# The package files come first, so a change that leaves dependencies alone reuses the installed ones.
COPY --parents package.json package-lock.json apps/*/*/package.json packages/*/package.json \
  spikes/*/*/package.json tools/package.json ./
RUN --mount=type=secret,id=ca-certs \
  if [ -f /run/secrets/ca-certs ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca-certs; fi \
  && npm ci --no-audit --no-fund
COPY . .
RUN npm run build -w @homelab/app-switcher -w @homelab/home-web -w @homelab/notes-web -w @homelab/encyclopedia-web

FROM node:26-alpine@sha256:6f08a523443ddedf52941874c203475b0ad503e859ad70cb26ab8be9a517dbd5
# VoidAuth's own Node, since its native SQLite module is built for it. Both images are Alpine 3.24.
COPY --from=voidauth /usr/bin/node /opt/voidauth/node
COPY --from=voidauth /app /app
RUN ln -s /data/voidauth/config /app/config && ln -s /data/voidauth/db /app/db
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy

WORKDIR /repo
COPY --parents package.json package-lock.json apps/*/*/package.json packages/*/package.json \
  spikes/*/*/package.json tools/package.json ./
# Only what runs: the Home and Notes servers' dependencies and the preview's own scripts.
RUN --mount=type=secret,id=ca-certs \
  if [ -f /run/secrets/ca-certs ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca-certs; fi \
  && npm ci --no-audit --no-fund --omit=dev \
    -w @homelab/home-server -w @homelab/notes-server -w @homelab/tools \
  && npm cache clean --force
COPY . .
COPY --from=web /repo/packages/app-switcher/dist packages/app-switcher/dist
COPY --from=web /repo/apps/home/web/dist apps/home/web/dist
COPY --from=web /repo/apps/notes/web/dist apps/notes/web/dist
COPY --from=web /repo/apps/encyclopedia/web/dist /srv/encyclopedia
COPY tools/preview/Caddyfile /etc/caddy/Caddyfile
COPY packages/gateway/signed-in.caddyfile /etc/caddy/signed-in.caddyfile

ENV NODE_ENV=production
EXPOSE 8080
VOLUME /data
CMD ["node", "tools/preview/start.ts"]
