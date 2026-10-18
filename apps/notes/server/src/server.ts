import path from "node:path";
import { Hocuspocus } from "@hocuspocus/server";
import { serve, upgradeWebSocket } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { WSContext } from "hono/ws";
import { WebSocket, WebSocketServer } from "ws";
import * as Y from "yjs";
import { openDatabase } from "./database.ts";
import { DocumentStore } from "./documents.ts";
import { OidcClient, SignInError, type PendingSignIn } from "./oidc.ts";
import { People, type Person } from "./people.ts";
import { SESSION_COOKIE, Sessions, type Session } from "./sessions.ts";

export interface ServerOptions {
  /** Holds the instance's one SQLite file (ADR-NOTE-004, ADR-NOTE-005). */
  dataDir: string;
  /** 0 picks a free port. */
  port: number;
  /** The address devices use, behind the HTTPS reverse proxy (ADR-NOTE-003). */
  publicUrl: string;
  /** The web client's build (apps/notes/web/dist). Without it, only the API is served. */
  clientDir?: string;
  /** Notes' client registration with VoidAuth (ADR-PLAT-004). */
  oidc: { issuer: string; clientId: string; clientSecret: string };
  /** For tests that move time forward. */
  now?: () => number;
}

/** Who is on the other end of a sync socket. Checked once, when the socket opens. */
interface SyncContext {
  person: Person;
  session: Session;
}

/** What the /sync middleware hands to the WebSocket upgrade. */
interface SyncEnv {
  Variables: { sync: SyncContext };
}

const PENDING_SIGN_IN_COOKIE = "notes_sign_in";
export const CALLBACK_PATH = "/api/sign-in/callback";
/** The client's screen for someone VoidAuth signed in but Notes does not admit. */
export const NO_ACCESS_PATH = "/no-access";
/** Where VoidAuth returns the browser after a sign-out: Notes, which then goes to sign-in. */
export const POST_SIGN_OUT_PATH = "/";

export async function startServer({
  dataDir,
  port,
  publicUrl,
  clientDir,
  oidc: oidcOptions,
  now,
}: ServerOptions) {
  const db = openDatabase(dataDir);
  const documents = new DocumentStore(db);
  const people = new People(db);
  const sessions = new Sessions(db, now);
  const oidc = new OidcClient({
    ...oidcOptions,
    redirectUri: new URL(CALLBACK_PATH, publicUrl).href,
    postLogoutRedirectUri: new URL(POST_SIGN_OUT_PATH, publicUrl).href,
  });

  // Open sync sockets by session token, so ending a session closes them at once (ADR-NOTE-014).
  const socketsBySession = new Map<string, Set<WSContext>>();
  const endSession = (token: string) => {
    sessions.revoke(token);
    for (const ws of socketsBySession.get(token) ?? [])
      ws.close(4401, "Session ended");
  };

  const hocuspocus = new Hocuspocus<SyncContext>({
    debounce: 1000,
    maxDebounce: 10_000,
    // ADR-NOTE-010: everything a person can open syncs over one socket.
    maxPendingDocuments: 20_000,
    maxUnauthenticatedQueueMessages: 100_000,
    maxUnauthenticatedQueueSize: 256 * 1024 * 1024,

    // Runs for every document a socket opens; the session was checked when the socket opened.
    // Until the access rules are built (ADR-NOTE-011), only workspace owners open documents.
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

  const signedIn = (cookie: string | undefined) => {
    const session = sessions.use(cookie);
    const person = session && people.get(session.personId);
    return session && person ? { session, person } : undefined;
  };

  const app = new Hono<SyncEnv>();

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.get("/api/sign-in", async (c) => {
    const started = await oidc.start().catch(() => undefined);
    if (!started) return c.json({ error: "sign_in_unavailable" }, 502);
    const { url, pending } = started;
    setCookie(c, PENDING_SIGN_IN_COOKIE, JSON.stringify(pending), {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/api/sign-in",
      maxAge: 600,
    });
    return c.redirect(url, 302);
  });

  app.get(CALLBACK_PATH, async (c) => {
    const saved = getCookie(c, PENDING_SIGN_IN_COOKIE);
    deleteCookie(c, PENDING_SIGN_IN_COOKIE, {
      path: "/api/sign-in",
      secure: true,
    });
    if (!saved) return c.json({ error: "no_sign_in_in_progress" }, 400);
    let identity;
    try {
      identity = await oidc.finish(
        new URL(c.req.url),
        parsePendingSignIn(saved),
      );
    } catch (error) {
      if (error instanceof SignInError || error instanceof SyntaxError) {
        return c.json({ error: "sign_in_failed" }, 400);
      }
      return c.json({ error: "sign_in_unavailable" }, 502);
    }
    const person = people.admit(identity);
    // The client's no-access screen never starts a sign-in itself, so this cannot loop.
    if (!person) return c.redirect(NO_ACCESS_PATH, 302);
    c.header("set-cookie", sessions.cookie(sessions.issue(person.id)), {
      append: true,
    });
    return c.redirect("/", 302);
  });

  // The PWA calls this whenever it is online: it renews the cookie, which the sync upgrade cannot.
  app.get("/api/session", (c) => {
    const current = signedIn(getCookie(c, SESSION_COOKIE));
    if (!current) return c.json({ error: "signed_out" }, 401);
    c.header("set-cookie", sessions.cookie(current.session.token));
    return c.json({ person: current.person });
  });

  // Signs this device out of Notes, then hands the browser to VoidAuth to sign out of the homelab
  // account. Also used with no Notes session, by someone Notes turned away.
  app.post("/api/sign-out", async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) endSession(token);
    c.header("set-cookie", sessions.cookie(""));
    const endSessionUrl = await oidc.endSessionUrl().catch(() => undefined);
    if (!endSessionUrl) return c.json({ error: "sign_out_unavailable" }, 502);
    return c.json({ endSessionUrl });
  });

  app.get(
    "/sync",
    // Refuse the upgrade without a valid session, before any WebSocket exists.
    async (c, next) => {
      const current = signedIn(getCookie(c, SESSION_COOKIE));
      if (!current) return c.text("Unauthorized", 401);
      c.set("sync", current);
      return next();
    },
    upgradeWebSocket((c: Context<SyncEnv>) => {
      const context = c.get("sync");
      const token = context.session.token;
      let connection:
        ReturnType<typeof hocuspocus.handleConnection> | undefined;
      return {
        onOpen(_event, ws) {
          const sockets = socketsBySession.get(token) ?? new Set();
          sockets.add(ws);
          socketsBySession.set(token, sockets);
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
        onClose(event, ws) {
          const sockets = socketsBySession.get(token);
          sockets?.delete(ws);
          if (sockets?.size === 0) socketsBySession.delete(token);
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

/** The pending sign-in cookie, which a browser could have altered. Bad JSON throws a SyntaxError. */
function parsePendingSignIn(saved: string): PendingSignIn {
  const value: unknown = JSON.parse(saved);
  if (
    typeof value !== "object" ||
    value === null ||
    !("state" in value) ||
    !("nonce" in value) ||
    !("verifier" in value) ||
    typeof value.state !== "string" ||
    typeof value.nonce !== "string" ||
    typeof value.verifier !== "string"
  )
    throw new SignInError("Malformed pending sign-in cookie");
  return { state: value.state, nonce: value.nonce, verifier: value.verifier };
}

export type NotesServer = Awaited<ReturnType<typeof startServer>>;
