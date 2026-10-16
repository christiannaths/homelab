import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@hocuspocus/server";
import * as Y from "yjs";
import { serveStatic } from "./static.js";
import { DocumentStore } from "./store.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(here, "../../data"));
const webRoot = path.resolve(process.env.WEB_ROOT ?? path.join(here, "../../web/dist"));
// Spike-level auth: if set, clients must present this shared token. Real accounts come later.
const sharedToken = process.env.LOCALNOTION_TOKEN;

const store = new DocumentStore(dataDir);

const server = new Server({
  port,
  quiet: true,
  // Persist shortly after edits stop, but at least every 10s while editing continues.
  debounce: 1000,
  maxDebounce: 10_000,
  // Clients sync the whole workspace over one socket, and Hocuspocus authenticates
  // each document separately. Its defaults (100 pending docs, 5 MB queued before
  // auth) are anti-abuse limits for public servers. A workspace with more pages
  // than that would be disconnected in a loop, so raise them for a homelab.
  maxPendingDocuments: 20_000,
  maxUnauthenticatedQueueMessages: 100_000,
  maxUnauthenticatedQueueSize: 256 * 1024 * 1024,

  async onAuthenticate({ token }) {
    if (sharedToken && token !== sharedToken) throw new Error("Unauthorized");
  },

  async onLoadDocument({ documentName, document }) {
    const state = store.load(documentName);
    if (state) Y.applyUpdate(document, state);
    return document;
  },

  async onStoreDocument({ documentName, document }) {
    store.save(documentName, Y.encodeStateAsUpdate(document));
  },

  async onRequest({ request, response }) {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/api/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, documents: store.count() }));
      throw null; // tells Hocuspocus the request was handled
    }
    if (serveStatic(webRoot, request, response)) throw null;
  },

  async onDestroy() {
    store.close();
  },
});

await server.listen();
console.log(`localnotion listening on http://localhost:${port} (data: ${dataDir})`);
