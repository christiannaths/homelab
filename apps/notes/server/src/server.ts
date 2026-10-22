import path from "node:path";
import { Hocuspocus } from "@hocuspocus/server";
import { serve, upgradeWebSocket } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import { WebSocket, WebSocketServer } from "ws";
import * as Y from "yjs";
import { openDatabase } from "./database.ts";
import { DocumentStore } from "./documents.ts";
import { identityFrom } from "@homelab/gateway";
import { People, type Person } from "./people.ts";

export interface ServerOptions {
  /** Holds the instance's one SQLite file (ADR-NOTE-004, ADR-NOTE-005). */
  dataDir: string;
  /** 0 picks a free port. */
  port: number;
  /** The web client's build (apps/notes/web/dist). Without it, only the API is served. */
  clientDir?: string;
}

/** Who is on the other end of a sync socket. Read once, when the socket opens. */
interface SyncContext {
  person: Person;
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
    // Until the access rules are built (ADR-NOTE-011), only owners open documents.
    async onAuthenticate({ context }) {
      if (people.get(context.person.id)?.role !== "owner")
        throw new Error("No access");
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

  /** The person the gateway signed in, added to or brought up to date in Notes' people. */
  const admitted = (c: Context): Person | undefined => {
    const identity = identityFrom(c.req.raw.headers);
    return identity && people.admit(identity);
  };

  const app = new Hono<SyncEnv>();

  app.get("/api/health", (c) => c.json({ ok: true }));

  // A page load the service worker leaves to the network, so a signed-out browser meets the
  // gateway, which sends it to VoidAuth's sign-in page and back here. By then it is signed in.
  app.get("/api/sign-in", (c) => c.redirect("/", 302));

  // The PWA calls this whenever it starts online or reconnects. A signed-out browser never gets
  // here: the gateway answers with a redirect to VoidAuth instead.
  app.get("/api/session", (c) => {
    const person = admitted(c);
    if (!person) return c.json({ error: "signed_out" }, 401);
    return c.json({ person });
  });

  app.get(
    "/sync",
    // Refuse an upgrade that did not come through the gateway, before any WebSocket exists.
    async (c, next) => {
      const person = admitted(c);
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
      hocuspocus.flushPendingStores();
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.close();
    },
  };
}

export type NotesServer = Awaited<ReturnType<typeof startServer>>;
