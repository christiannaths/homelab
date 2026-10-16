# Build from the repo root: docker build -f spikes/notes-block-editing-collaboration-poc/Dockerfile .
FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY spikes/notes-block-editing-collaboration-poc/web/package.json spikes/notes-block-editing-collaboration-poc/web/
COPY spikes/notes-block-editing-collaboration-poc/server/package.json spikes/notes-block-editing-collaboration-poc/server/
# Playwright is only used to render PNG icons, which are committed, so skip its browser download.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci -w @homelab/notes-block-editing-collaboration-poc-web -w @homelab/notes-block-editing-collaboration-poc-server
COPY spikes/notes-block-editing-collaboration-poc/web spikes/notes-block-editing-collaboration-poc/web
COPY spikes/notes-block-editing-collaboration-poc/server spikes/notes-block-editing-collaboration-poc/server
RUN npm run build -w @homelab/notes-block-editing-collaboration-poc-web && npm run build -w @homelab/notes-block-editing-collaboration-poc-server

FROM node:26-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
COPY package.json package-lock.json ./
COPY spikes/notes-block-editing-collaboration-poc/server/package.json spikes/notes-block-editing-collaboration-poc/server/
RUN npm ci --omit=dev -w @homelab/notes-block-editing-collaboration-poc-server --include-workspace-root=false
COPY --from=build /app/spikes/notes-block-editing-collaboration-poc/server/dist spikes/notes-block-editing-collaboration-poc/server/dist
COPY --from=build /app/spikes/notes-block-editing-collaboration-poc/web/dist spikes/notes-block-editing-collaboration-poc/web/dist
VOLUME /data
EXPOSE 3000
# --no-experimental-webstorage: Node 26 warns when lib0 (a Yjs dependency) probes the
# server-side localStorage global. We never use it, so turn it off.
CMD ["node", "--no-experimental-webstorage", "spikes/notes-block-editing-collaboration-poc/server/dist/index.js"]
