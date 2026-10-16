# Build from the repo root: docker build -f apps/notes/Dockerfile .
FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/notes/web/package.json apps/notes/web/
COPY apps/notes/server/package.json apps/notes/server/
# Playwright is only used to render PNG icons, which are committed, so skip its browser download.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci -w @homelab/notes-web -w @homelab/notes-server
COPY apps/notes/web apps/notes/web
COPY apps/notes/server apps/notes/server
RUN npm run build -w @homelab/notes-web && npm run build -w @homelab/notes-server

FROM node:26-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
COPY package.json package-lock.json ./
COPY apps/notes/server/package.json apps/notes/server/
RUN npm ci --omit=dev -w @homelab/notes-server --include-workspace-root=false
COPY --from=build /app/apps/notes/server/dist apps/notes/server/dist
COPY --from=build /app/apps/notes/web/dist apps/notes/web/dist
VOLUME /data
EXPOSE 3000
# --no-experimental-webstorage: Node 26 warns when lib0 (a Yjs dependency) probes the
# server-side localStorage global. We never use it, so turn it off.
CMD ["node", "--no-experimental-webstorage", "apps/notes/server/dist/index.js"]
