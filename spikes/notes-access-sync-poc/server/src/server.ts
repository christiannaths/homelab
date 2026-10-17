import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@hocuspocus/server";
import {
  addPerson, canEditContent, documentAccess, indexDocName, isRefusal, parseDocName, readOnlyAt, removePerson,
  reviewUpdate, writeIndex, type Person, type Refusal, type Role,
} from "@homelab/notes-access-sync-poc-model";
import {
  readTeamspace, refuseTeamspaceChange, setTeamspaceMember, teamspaceAfterUpdate, teamspaceDocName, writeTeamspaceIndex,
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
for (const name of store.names("teamspace:")) {
  const ref = parseDocName(name);
  const state = store.load(name);
  if (ref?.kind === "teamspace" && state) catalog.loadStoredTeamspace(ref.teamspaceId, state);
}

/** Every update refused since the server started, for tests and diagnostics (GET /api/refusals). */
const refusals: { personId: string; documentName: string; reason: Refusal }[] = [];

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
    if (readOnlyAt(level)) connectionConfig.readOnly = true;
    return { person };
  },

  // Hocuspocus calls this before applying any sync message, read-only connections included. Every
  // update (SyncStep2 on each (re)connect, and live updates) is reviewed against the person's
  // level now, not at open, so it follows access changes; new pages are reviewed where they are
  // placed. A refused update is not applied, and throwing closes this document's connection (only
  // this one: the socket and the person's other documents stay up) with the reason. The device
  // takes that reason as "throw your copy away and sync it again" (#18), so it never resends the
  // update. Hocuspocus's own read-only handling would instead drop it silently, and the device
  // would stay diverged and resend it on every reconnect.
  async beforeSync({ type, payload, document, documentName, connection, context }) {
    if (type === 0) return; // SyncStep1 only asks for what the device lacks.
    const person = context.person.id;
    const workspace = catalog.workspace();
    const levels = catalog.levels(person);
    const ref = parseDocName(documentName);
    const reason =
      reviewUpdate(workspace, person, documentName, document, payload, levels) ??
      (ref?.kind === "teamspace" ? teamspaceRefusal(ref.teamspaceId, document, payload, context.person) : null);
    if (reason) {
      refusals.push({ personId: person, documentName, reason });
      throw { reason };
    }
    // A page (or a database's properties) opened read-only whose person can now change some of
    // it: the review above has accepted the update, so let it through. Can edit content counts,
    // because it may change a database's rows (#20).
    if (connection.readOnly && (ref?.kind === "page" || ref?.kind === "schema")) {
      connection.readOnly = !canEditContent(documentAccess(workspace, person, documentName, levels));
    }
  },

  // Keep the catalog current, and the page indexes with it. Title and content edits don't change
  // who can open what, so only new pages, moves and access changes refresh the indexes.
  async onChange({ documentName, document }) {
    const ref = parseDocName(documentName);
    if (ref?.kind === "page" && catalog.update(ref.id, document)) refreshIndexes();
    if (ref?.kind === "teamspace" && catalog.updateTeamspace(ref.teamspaceId, document)) refreshIndexes();
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
      // Keep the document loaded until the debounced store. Unloading it at once raced with the
      // person's device opening it in the same moment (Hocuspocus 4.7.1 hands the connection the
      // document it is destroying), so the device was attached to a dead copy and never got
      // later index changes or closes (#21; seen about 1 run in 8 of the removal test).
      await connection.disconnect({ unloadImmediately: false });
      catalog.indexWritten(personId, levels);
      applyAccessChanges(personId);
    }
    for (const { personId, levels } of catalog.staleTeamspaceIndexes()) {
      const connection = await server.hocuspocus.openDirectConnection(indexDocName(personId));
      await connection.transact((doc) => writeTeamspaceIndex(doc, levels));
      await connection.disconnect({ unloadImmediately: false }); // see above
      catalog.teamspaceIndexWritten(personId, levels);
      applyAccessChanges(personId); // a teamspace they left or were taken out of
    }
  }).catch((error) => console.error("refreshing page indexes failed:", error));
  return indexWrites;
}

/**
 * Adds a new workspace member (not a guest) to every default teamspace, whatever its kind, as an
 * ordinary member entry they can later leave. The server writes it, like the indexes.
 */
async function joinDefaultTeamspaces(person: Person): Promise<void> {
  if (person.role === "guest") return;
  for (const teamspace of catalog.workspace().teamspaces ?? []) {
    if (!teamspace.isDefault) continue;
    const connection = await server.hocuspocus.openDirectConnection(teamspaceDocName(teamspace.id));
    await connection.transact((doc) => {
      setTeamspaceMember(doc, person.id, "member");
    });
    catalog.updateTeamspace(teamspace.id, connection.document!);
    await connection.disconnect();
  }
}

/**
 * Refuses a change to a teamspace document that `person` may not make (`refuseTeamspaceChange`),
 * comparing the server's copy with what the update would make of it. Throwing closes that
 * document's connection with the reason, and the update is not applied, as for page updates.
 */
function teamspaceRefusal(id: string, document: Y.Doc, update: Uint8Array, person: Person): Refusal | null {
  const before = readTeamspace(id, document);
  const after = teamspaceAfterUpdate(id, document, update);
  if (!after) return before ? "teamspace-change-refused" : null;
  const reason = refuseTeamspaceChange(catalog.workspace().people, before, after, person);
  return reason === null ? null : isRefusal(reason) ? reason : "teamspace-change-refused";
}

/**
 * Brings `personId`'s open connections in line with their current access, so an access change
 * takes effect on a device that is already connected (#16, #21):
 * - A document they can no longer open is closed with the reason "access-revoked", and the
 *   device deletes its copy (#21). That covers pages, a database's properties (`schema:`, which
 *   go with the last of its rows or the database the person loses, #20), a teamspace they left,
 *   and every document, their index included, once they are removed from the workspace. The
 *   device's other documents stay open on the same socket.
 * - Otherwise the connection becomes read-only or read-write to match the level now, as
 *   `onAuthenticate` would open it, so a downgrade to Can view is read-only at once (#18's review
 *   refuses its updates either way, and an upgrade is let through there too).
 * It asks the catalog's *current* levels, not the ones just written: a page created while the
 * index was being written must not count as revoked.
 */
function applyAccessChanges(personId: string): void {
  const workspace = catalog.workspace();
  const levels = catalog.levels(personId);
  for (const [documentName, document] of server.hocuspocus.documents) {
    const level = documentAccess(workspace, personId, documentName, levels);
    for (const connection of document.getConnections()) {
      if (connection.context.person.id !== personId) continue;
      if (level === "none") connection.close({ code: 4403, reason: "access-revoked" });
      else connection.readOnly = readOnlyAt(level);
    }
  }
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
 * - DELETE /api/people/:id → removes a person (the caller must be an owner); their open
 *                            documents are closed with "access-revoked"
 * - GET  /api/connections  → which person each open document connection belongs to
 * - GET  /api/refusals     → every update refused since the server started, oldest first
 */
async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/api/")) return false;
  const route = `${req.method} ${url.pathname}`;

  if (route === "GET /api/health") return sendJson(res, 200, { ok: true, documents: store.count() });
  if (route === "GET /api/people") return sendJson(res, 200, store.people());
  if (route === "GET /api/connections") return sendJson(res, 200, connections());
  if (route === "GET /api/refusals") return sendJson(res, 200, refusals);
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
    await joinDefaultTeamspaces(result.person);
    await refreshIndexes();
    return sendJson(res, 201, result.person);
  }
  const removing = req.method === "DELETE" && url.pathname.match(/^\/api\/people\/([^/]+)$/)?.[1];
  if (removing) {
    const people = store.people();
    const actorId = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    const actor = people.find((p) => p.id === actorId) ?? null;
    const result = removePerson(people, actor, decodeURIComponent(removing));
    if (!result.ok) return sendJson(res, !actor ? 401 : result.reason === "No such person." ? 404 : 403, { error: result.reason });
    store.removePerson(result.person.id);
    catalog.setPeople(store.people());
    // Everything they had open is closed now; their devices delete the workspace's pages, and
    // every later request from them is refused (they are no longer anyone the server knows).
    applyAccessChanges(result.person.id);
    await refreshIndexes();
    return sendJson(res, 200, result.person);
  }
  return sendJson(res, 404, { error: "Not found" });
}

// Bring every stored index in line with the catalog (it may have been written by an older rule).
await refreshIndexes();
await server.listen();
console.log(`notes-access-sync-poc listening on http://localhost:${port} (data: ${dataDir})`);
