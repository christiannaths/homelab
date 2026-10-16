import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@hocuspocus/server";
import {
  addPerson, canShare, documentAccess, indexDocName, parseDocName, refuseUpdate, touchedRoots, writeIndex,
  type Person, type Role,
} from "@homelab/notes-access-sync-poc-model";
import * as Y from "yjs";
import { PageCatalog } from "./catalog.ts";
import { serveStatic } from "./static.ts";
import { Store } from "./store.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(here, "../../data"));
const webRoot = path.resolve(process.env.WEB_ROOT ?? path.join(here, "../../web/dist"));

const store = new Store(dataDir);

// Every page's metadata, read from storage now and kept current from each page document's changes.
const catalog = new PageCatalog(store.people());
for (const name of store.names("page:")) {
  const ref = parseDocName(name);
  const state = store.load(name);
  if (ref?.kind === "page" && state) catalog.loadStored(ref.id, state);
}

/** What the server keeps about each connection: the person it belongs to. */
export interface ConnectionContext {
  person: Person;
}

const server = new Server<ConnectionContext>({
  port,
  quiet: true,
  // Persist shortly after edits stop, but at least every 10s while editing continues.
  debounce: 1000,
  maxDebounce: 10_000,
  // Clients sync the whole workspace over one socket, and Hocuspocus authenticates each document
  // separately. Its defaults (100 pending docs, 5 MB queued before auth) are anti-abuse limits for
  // public servers; raise them so a large workspace isn't disconnected in a loop.
  maxPendingDocuments: 20_000,
  maxUnauthenticatedQueueMessages: 100_000,
  maxUnauthenticatedQueueSize: 256 * 1024 * 1024,

  // Identity is faked: the token is the id of the person the device picked, and the server trusts it.
  // Hocuspocus calls this for every document a connection opens, so access is checked per document
  // with the access rules, against the catalog's current page tree.
  async onAuthenticate({ token, documentName, connectionConfig }): Promise<ConnectionContext> {
    const workspace = catalog.workspace();
    const person = workspace.people.find((p) => p.id === token);
    const level = person ? documentAccess(workspace, person.id, documentName, catalog.levels(person.id)) : "none";
    if (!person || level === "none") {
      // A plain object (no .message) keeps Hocuspocus from logging every refusal.
      throw { reason: "no-access" };
    }
    // The server refuses every update on a read-only connection (a person's page index, for now).
    if (level === "view" || level === "comment") connectionConfig.readOnly = true;
    return { person };
  },

  // Hocuspocus calls this before applying any sync message. A page document's `access` map may
  // only be changed with Full access, so updates from connections below Full (and above view,
  // whose connections are read-only and refused by Hocuspocus itself) are checked against what
  // they would change. Throwing closes that document's connection with the reason, and the
  // update is not applied. The level is looked up now, not at open, so it follows access changes.
  async beforeSync({ type, payload, document, documentName, connection, context }) {
    if (type === 0 || connection.readOnly || parseDocName(documentName)?.kind !== "page") return;
    const level = documentAccess(catalog.workspace(), context.person.id, documentName, catalog.levels(context.person.id));
    if (canShare(level)) return;
    const reason = refuseUpdate(level, touchedRoots(document, payload));
    if (reason) throw { reason };
  },

  // Keep the catalog current, and the page indexes with it. Title and content edits don't change
  // who can open what, so only new pages, moves and access changes refresh the indexes.
  async onChange({ documentName, document }) {
    const ref = parseDocName(documentName);
    if (ref?.kind === "page" && catalog.update(ref.id, document)) refreshIndexes();
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
    if (await handleApi(request, response)) throw null; // tells Hocuspocus the request was handled
    if (serveStatic(webRoot, request, response)) throw null;
  },

  async onDestroy() {
    store.close();
  },
});

let indexWrites: Promise<void> = Promise.resolve();

/**
 * Rewrites the page index (`index:<personId>`) of everyone whose visible pages changed. Only the
 * server writes indexes, through a direct connection, so devices following one get the change at
 * their next sync. Writes are queued so they never overlap.
 */
function refreshIndexes(): Promise<void> {
  indexWrites = indexWrites.then(async () => {
    for (const { personId, levels } of catalog.staleIndexes()) {
      const connection = await server.hocuspocus.openDirectConnection(indexDocName(personId));
      await connection.transact((doc) => writeIndex(doc, levels));
      await connection.disconnect();
      catalog.indexWritten(personId, levels);
    }
  }).catch((error) => console.error("refreshing page indexes failed:", error));
  return indexWrites;
}

function sendJson(res: ServerResponse, status: number, body: unknown): true {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
  return true;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || "{}");
  } catch {
    return {};
  }
}

/** The people who are actually connected: one entry per open document per connection. */
function connections(): { personId: string; documentName: string }[] {
  const out: { personId: string; documentName: string }[] = [];
  for (const [documentName, document] of server.hocuspocus.documents) {
    for (const connection of document.getConnections()) {
      out.push({ personId: connection.context.person.id, documentName });
    }
  }
  return out;
}

/**
 * The spike's HTTP API:
 * - GET  /api/health       → { ok, documents }
 * - GET  /api/people       → everyone in the workspace (the list a device picks its person from)
 * - POST /api/people       → { name, role }; the first person becomes the owner, after that the
 *                            caller (Authorization: Bearer <person id>) must be an owner
 * - GET  /api/connections  → which person each open document connection belongs to
 */
async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/api/")) return false;
  const route = `${req.method} ${url.pathname}`;

  if (route === "GET /api/health") return sendJson(res, 200, { ok: true, documents: store.count() });
  if (route === "GET /api/people") return sendJson(res, 200, store.people());
  if (route === "GET /api/connections") return sendJson(res, 200, connections());
  if (route === "POST /api/people") {
    const body = (await readJson(req)) as { name?: unknown; role?: unknown };
    const role = body.role === "owner" || body.role === "guest" ? body.role : "member";
    const people = store.people();
    const actorId = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    const actor = people.find((p) => p.id === actorId) ?? null;
    const result = addPerson(people, actor, {
      id: crypto.randomUUID(),
      name: typeof body.name === "string" ? body.name : "",
      role: role as Role,
    });
    if (!result.ok) return sendJson(res, people.length && !actor ? 401 : 403, { error: result.reason });
    store.addPerson(result.person);
    catalog.setPeople(store.people());
    await refreshIndexes();
    return sendJson(res, 201, result.person);
  }
  return sendJson(res, 404, { error: "Not found" });
}

// Bring every stored index in line with the catalog (it may have been written by an older rule).
await refreshIndexes();
await server.listen();
console.log(`notes-access-sync-poc listening on http://localhost:${port} (data: ${dataDir})`);
