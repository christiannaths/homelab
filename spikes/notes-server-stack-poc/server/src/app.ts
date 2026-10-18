import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Hocuspocus } from "@hocuspocus/server";
import { serve, upgradeWebSocket } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { type Context, Hono } from "hono";
import type { WSContext } from "hono/ws";
import { WebSocketServer } from "ws";
import * as Y from "yjs";
import { createAuth, migrateAuth, placeholderEmail } from "./auth.ts";
import { DocumentStore } from "./store.ts";

export interface ServerOptions {
  dataDir: string;
  webRoot: string;
  /** 0 picks a free port. */
  port: number;
  /** The address devices use, e.g. the HTTPS name from `tailscale serve` (ADR-NOTE-003). */
  baseURL: string;
  secret: string;
}

/** Who is on the other end of a sync socket. Checked once, when the socket opens. */
interface SyncContext {
  userId: string;
  role: string;
  sessionToken: string;
}

interface SyncEnv {
  Variables: { sync: SyncContext };
}

export async function startServer({
  dataDir,
  webRoot,
  port,
  baseURL,
  secret,
}: ServerOptions) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, "notes.sqlite"));
  db.exec("PRAGMA journal_mode = WAL;");
  const store = new DocumentStore(db);

  // Open sync sockets by session, so revoking a session can close them right away.
  const socketsBySession = new Map<string, Set<WSContext>>();

  const auth = createAuth({
    db,
    baseURL,
    secret,
    onSessionDeleted(token) {
      for (const ws of socketsBySession.get(token) ?? [])
        ws.close(4401, "Session revoked");
    },
  });
  await migrateAuth(auth);

  const hocuspocus = new Hocuspocus<SyncContext>({
    debounce: 1000,
    maxDebounce: 10_000,
    // ADR-NOTE-010: the whole workspace syncs over one socket.
    maxPendingDocuments: 20_000,
    maxUnauthenticatedQueueMessages: 100_000,
    maxUnauthenticatedQueueSize: 256 * 1024 * 1024,

    // Runs for every document a socket opens. The session was already checked when
    // the socket opened, so this only decides access to this one document (ADR-NOTE-011, ADR-NOTE-012).
    // A stand-in for real access rules: "private/<userId>/…" is only for its owner,
    // and "readonly/…" is read-only for everyone but admins.
    async onAuthenticate({ context, documentName, connectionConfig }) {
      const [area, owner] = documentName.split("/");
      if (area === "private" && owner !== context.userId)
        throw new Error("No access");
      if (area === "readonly" && context.role !== "admin")
        connectionConfig.readOnly = true;
    },

    async onLoadDocument({ documentName, document }) {
      const state = store.load(documentName);
      if (state) Y.applyUpdate(document, state);
      return document;
    },

    async onStoreDocument({ documentName, document }) {
      store.save(documentName, Y.encodeStateAsUpdate(document));
    },
  });

  const app = new Hono<SyncEnv>();

  app.get("/api/health", (c) => c.json({ ok: true, documents: store.count() }));

  // First run: create the admin account (ADR-NOTE-009). Refused once any account exists.
  app.post("/api/setup", async (c) => {
    const n = db.prepare(`SELECT COUNT(*) AS n FROM "user"`).get()?.n;
    if (typeof n !== "number") throw new Error("COUNT(*) returned no number");
    if (n > 0) return c.json({ error: "Already set up" }, 409);
    const body: unknown = await c.req.json();
    const { username, password } = parseSetupBody(body);
    const { user } = await auth.api.createUser({
      body: {
        email: placeholderEmail(username),
        password,
        name: username,
        role: "admin",
        data: { username },
      },
    });
    return c.json({ id: user.id });
  });

  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  app.get(
    "/sync",
    // Refuse the upgrade without a valid session, before any WebSocket exists.
    async (c, next) => {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!session) return c.text("Unauthorized", 401);
      c.set("sync", {
        userId: session.user.id,
        role: session.user.role ?? "user",
        sessionToken: session.session.token,
      });
      await next();
      return undefined;
    },
    upgradeWebSocket((c: Context<SyncEnv>) => {
      const context = c.get("sync");
      let connection:
        ReturnType<typeof hocuspocus.handleConnection> | undefined;
      return {
        onOpen(_event, ws) {
          const sockets =
            socketsBySession.get(context.sessionToken) ?? new Set();
          sockets.add(ws);
          socketsBySession.set(context.sessionToken, sockets);
          if (!ws.raw) throw new Error("Upgraded socket has no raw WebSocket");
          connection = hocuspocus.handleConnection(ws.raw, c.req.raw, context);
        },
        onMessage(event) {
          // The adapter hands binary frames over as ArrayBuffer; the sync protocol has no text frames.
          if (event.data instanceof ArrayBuffer)
            connection?.handleMessage(new Uint8Array(event.data));
        },
        onClose(event, ws) {
          socketsBySession.get(context.sessionToken)?.delete(ws);
          connection?.handleClose(event);
        },
      };
    }),
  );

  // The PWA, with a fallback to index.html for client-side routes.
  app.use("/*", serveStatic({ root: path.relative(process.cwd(), webRoot) }));
  app.get(
    "*",
    serveStatic({
      path: path.relative(process.cwd(), path.join(webRoot, "index.html")),
    }),
  );

  const wss = new WebSocketServer({ noServer: true });
  const server = serve({ fetch: app.fetch, port, websocket: { server: wss } });
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (typeof address !== "object" || address === null)
    throw new Error("Server is not listening on a TCP port");
  return {
    port: address.port,
    auth,
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

function parseSetupBody(body: unknown): { username: string; password: string } {
  if (
    typeof body === "object" &&
    body !== null &&
    "username" in body &&
    typeof body.username === "string" &&
    "password" in body &&
    typeof body.password === "string"
  )
    return { username: body.username, password: body.password };
  throw new Error("setup body needs a username and password");
}
