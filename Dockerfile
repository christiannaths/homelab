FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
# Playwright is only used to render PNG icons, which are committed, so skip its browser download.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci
COPY . .
RUN npm run build

FROM node:26-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev -w @localnotion/server --include-workspace-root=false
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/web/dist apps/web/dist
VOLUME /data
EXPOSE 3000
# --no-experimental-webstorage: Node 26 warns when lib0 (a Yjs dependency) probes the
# server-side localStorage global. We never use it, so turn it off.
CMD ["node", "--no-experimental-webstorage", "apps/server/dist/index.js"]
