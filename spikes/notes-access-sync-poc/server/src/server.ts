import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@hocuspocus/server";
import { addPerson, documentAccess, type Person, type Role } from "@homelab/notes-access-sync-poc-model";
import * as Y from "yjs";
import { serveStatic } from "./static.ts";
import { Store } from "./store.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(here, "../../data"));
const webRoot = path.resolve(process.env.WEB_ROOT ?? path.join(here, "../../web/dist"));

const store = new Store(dataDir);

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
  // Hocuspocus calls this for every document a connection opens.
  async onAuthenticate({ token, documentName }): Promise<ConnectionContext> {
    const people = store.people();
    const person = people.find((p) => p.id === token);
    if (!person || documentAccess({ people }, person.id, documentName) === "none") {
      // A plain object (no .message) keeps Hocuspocus from logging every refusal.
      throw { reason: "no-access" };
    }
    return { person };
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
    return sendJson(res, 201, result.person);
  }
  return sendJson(res, 404, { error: "Not found" });
}

await server.listen();
console.log(`notes-access-sync-poc listening on http://localhost:${port} (data: ${dataDir})`);
