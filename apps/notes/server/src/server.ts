import path from "node:path";
import { Hocuspocus } from "@hocuspocus/server";
import { serve, upgradeWebSocket } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import { WebSocket, WebSocketServer } from "ws";
import * as Y from "yjs";
import { openDatabase } from "./database.ts";
import { DocumentStore } from "./documents.ts";
import { identityFrom } from "@homelab/identity";
import {
  canEdit,
  documentLevel,
  parseDocName,
  previewUpdate,
  readPage,
  reviewUpdate,
  type Page,
} from "@homelab/notes-model";
import { Notebooks, type SyncContext } from "./notebooks.ts";
import { People, type Person } from "./people.ts";
import { Workspaces } from "./workspaces.ts";

export interface ServerOptions {
  /** Holds the instance's one SQLite file (ADR-NOTE-004, ADR-NOTE-005). */
  dataDir: string;
  /** 0 picks a free port. */
  port: number;
  /** The web client's build (apps/notes/web/dist). Without it, only the API is served. */
  clientDir?: string;
}

/** What the /sync middleware hands to the WebSocket upgrade. */
interface SyncEnv {
  Variables: { sync: SyncContext };
}

export async function startServer({ dataDir, port, clientDir }: ServerOptions) {
  const db = openDatabase(dataDir);
  const documents = new DocumentStore(db);
  const people = new People(db);

  const hocuspocus = new Hocuspocus<SyncContext>({
    debounce: 1000,
    maxDebounce: 10_000,
    // ADR-NOTE-010: everything a person can open syncs over one socket.
    maxPendingDocuments: 20_000,
    maxUnauthenticatedQueueMessages: 100_000,
    maxUnauthenticatedQueueSize: 256 * 1024 * 1024,

    // Runs for every document a socket opens; the person was read when the socket opened.
    async onAuthenticate({ context, documentName, connectionConfig }) {
      const level = documentLevel(
        notebooks.catalog,
        context.person.id,
        documentName,
      );
      // A plain object, without a message, keeps Hocuspocus from logging every refusal.
      if (level === "none") throw { reason: "no-access" };
      connectionConfig.readOnly = !canEdit(level);
    },

    // ADR-NOTE-010: every update is checked at the person's access now, not at open. A refused
    // one is not applied, and throwing closes only this document, with the reason; the device
    // then throws its copy away and syncs it again. Hocuspocus's own read-only handling would
    // drop the update silently, and the device would resend it on every reconnect.
    async beforeSync({ type, payload, document, documentName, context }) {
      if (type === SYNC_STEP_1) return;
      const reason = reviewUpdate(
        notebooks.catalog,
        context.person.id,
        documentName,
        previewUpdate(documentName, document, payload),
      );
      if (reason) throw { reason };
    },

    // Server writes (direct connections) pass here too, without beforeSync.
    async onChange({ documentName, document }) {
      const ref = parseDocName(documentName);
      if (ref?.kind === "page") notebooks.pageChanged(ref.id, document);
    },

    async onLoadDocument({ documentName, document }) {
      const state = documents.load(documentName);
      if (state) Y.applyUpdate(document, state);
      return document;
    },

    async onStoreDocument({ documentName, document }) {
      documents.save(documentName, Y.encodeStateAsUpdate(document));
    },
  });

  const notebooks = new Notebooks(
    new Workspaces(db),
    storedPages(documents),
    hocuspocus,
  );
  // Indexes stored by an earlier run may list what the rules no longer give.
  await notebooks.refreshIndexes();

  /**
   * The person the gateway signed in, added to or brought up to date in Notes' people, with a
   * workspace of their own.
   */
  const admitted = async (c: Context): Promise<Person | undefined> => {
    const identity = identityFrom(c.req.raw.headers);
    if (!identity) return undefined;
    const person = people.admit(identity);
    await notebooks.admit(person);
    return person;
  };

  const app = new Hono<SyncEnv>();

  app.get("/api/health", (c) => c.json({ ok: true }));

  // A page load the service worker leaves to the network, so a signed-out browser meets the
  // gateway, which sends it to the accounts service's sign-in page and back here. By then it is
  // signed in.
  app.get("/api/sign-in", (c) => c.redirect("/", 302));

  // The PWA calls this whenever it starts online or reconnects. A signed-out browser never gets
  // here: the gateway answers with a redirect to sign in instead.
  app.get("/api/session", async (c) => {
    const person = await admitted(c);
    if (!person) return c.json({ error: "signed_out" }, 401);
    return c.json({ person });
  });

  // Needs a connection, since membership is server data (ADR-NOTE-013); the name then lives in
  // the workspace document. JSON only: a cross-site form can't send it, so another site can't
  // make workspaces for whoever is signed in (ADR-NOTE-014).
  app.post("/api/workspaces", async (c) => {
    const person = await admitted(c);
    if (!person) return c.json({ error: "signed_out" }, 401);
    if (
      c.req.header("content-type")?.split(";")[0].trim() !== "application/json"
    )
      return c.json({ error: "json_only" }, 415);
    const name = workspaceNameFrom(await c.req.json().catch(() => undefined));
    if (name === undefined) return c.json({ error: "name_required" }, 400);
    const id = await notebooks.create(person, name);
    return c.json({ workspace: { id, name } }, 201);
  });

  app.get(
    "/sync",
    // Refuse an upgrade that did not come through the gateway, before any WebSocket exists.
    async (c, next) => {
      const person = await admitted(c);
      if (!person) return c.text("Unauthorized", 401);
      c.set("sync", { person });
      return next();
    },
    upgradeWebSocket((c: Context<SyncEnv>) => {
      const context = c.get("sync");
      let connection:
        ReturnType<typeof hocuspocus.handleConnection> | undefined;
      return {
        onOpen(_event, ws) {
          // The socket is created by this module's WebSocketServer, so it is a ws WebSocket.
          if (!(ws.raw instanceof WebSocket))
            throw new Error("Sync socket is not a ws WebSocket");
          connection = hocuspocus.handleConnection(ws.raw, c.req.raw, context);
        },
        onMessage(event) {
          // Binary frames arrive as ArrayBuffers; the sync protocol sends no text frames.
          if (event.data instanceof ArrayBuffer)
            connection?.handleMessage(new Uint8Array(event.data));
        },
        onClose(event) {
          connection?.handleClose(event);
        },
      };
    }),
  );

  app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

  if (clientDir) {
    // The service worker and the app shell must be revalidated so updates reach devices; Vite
    // fingerprints everything under assets/, so those never change.
    const onFound = (filePath: string, c: Context) => {
      c.header(
        "cache-control",
        filePath.includes(`${path.sep}assets${path.sep}`)
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      );
    };
    app.use("*", serveStatic({ root: clientDir, onFound }));
    // Client-side routes get the app shell. The sync socket is a route of its own, not a page.
    app.get("*", async (c, next) => {
      if (c.req.path.startsWith("/sync")) return c.text("Not Found", 404);
      return serveStatic({ root: clientDir, path: "index.html", onFound })(
        c,
        next,
      );
    });
  }

  const wss = new WebSocketServer({ noServer: true });
  const server = serve({ fetch: app.fetch, port, websocket: { server: wss } });
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (typeof address !== "object" || address === null)
    throw new Error("Server is not listening on a TCP port");
  return {
    port: address.port,
    db,
    hocuspocus,
    async close() {
      await notebooks.settled();
      hocuspocus.flushPendingStores();
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.close();
    },
  };
}

export type NotesServer = Awaited<ReturnType<typeof startServer>>;

/** Every stored page's `meta` and `access`, read once at startup for the catalog. */
function* storedPages(documents: DocumentStore): Generator<Page> {
  for (const name of documents.names("page:")) {
    const ref = parseDocName(name);
    const state = documents.load(name);
    if (ref?.kind !== "page" || !state) continue;
    const doc = new Y.Doc();
    Y.applyUpdate(doc, state);
    const page = readPage(ref.id, doc);
    doc.destroy();
    if (page) yield page;
  }
}

/** The longest workspace name kept; longer ones are cut. */
const MAX_WORKSPACE_NAME = 100;

/** The trimmed, non-empty name in a create-workspace request, or undefined. */
function workspaceNameFrom(body: unknown): string | undefined {
  const name =
    typeof body === "object" && body !== null && "name" in body
      ? body.name
      : undefined;
  if (typeof name !== "string") return undefined;
  const trimmed = name.trim().slice(0, MAX_WORKSPACE_NAME);
  return trimmed === "" ? undefined : trimmed;
}

/** The y-protocols sync message that only asks for what the device lacks. */
const SYNC_STEP_1 = 0;
