import type { AddressInfo } from "node:net";
import { Hocuspocus, type WebSocketLike } from "@hocuspocus/server";
import { serve, upgradeWebSocket } from "@hono/node-server";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { WSContext } from "hono/ws";
import { WebSocketServer } from "ws";
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

const PENDING_SIGN_IN_COOKIE = "notes_sign_in";
export const CALLBACK_PATH = "/api/sign-in/callback";

export async function startServer({ dataDir, port, publicUrl, oidc: oidcOptions, now }: ServerOptions) {
  const db = openDatabase(dataDir);
  const documents = new DocumentStore(db);
  const people = new People(db);
  const sessions = new Sessions(db, now);
  const oidc = new OidcClient({ ...oidcOptions, redirectUri: new URL(CALLBACK_PATH, publicUrl).href });

  // Open sync sockets by session token, so ending a session closes them at once (ADR-NOTE-014).
  const socketsBySession = new Map<string, Set<WSContext>>();
  const endSession = (token: string) => {
    sessions.revoke(token);
    for (const ws of socketsBySession.get(token) ?? []) ws.close(4401, "Session ended");
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
      if (people.get(context.person.id)?.role !== "owner") throw new Error("No access");
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

  const app = new Hono();

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
    deleteCookie(c, PENDING_SIGN_IN_COOKIE, { path: "/api/sign-in", secure: true });
    if (!saved) return c.json({ error: "no_sign_in_in_progress" }, 400);
    let identity;
    try {
      identity = await oidc.finish(new URL(c.req.url), JSON.parse(saved) as PendingSignIn);
    } catch (error) {
      if (error instanceof SignInError || error instanceof SyntaxError) {
        return c.json({ error: "sign_in_failed" }, 400);
      }
      return c.json({ error: "sign_in_unavailable" }, 502);
    }
    const person = people.admit(identity);
    if (!person) return c.json({ error: "not_a_member" }, 403);
    c.header("set-cookie", sessions.cookie(sessions.issue(person.id)), { append: true });
    return c.redirect("/", 302);
  });

  // The PWA calls this whenever it is online: it renews the cookie, which the sync upgrade cannot.
  app.get("/api/session", (c) => {
    const current = signedIn(getCookie(c, SESSION_COOKIE));
    if (!current) return c.json({ error: "signed_out" }, 401);
    c.header("set-cookie", sessions.cookie(current.session.token));
    return c.json({ person: current.person });
  });

  app.post("/api/sign-out", (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) endSession(token);
    c.header("set-cookie", sessions.cookie(""));
    return c.body(null, 204);
  });

  app.get(
    "/sync",
    // Refuse the upgrade without a valid session, before any WebSocket exists.
    async (c, next) => {
      const current = signedIn(getCookie(c, SESSION_COOKIE));
      if (!current) return c.text("Unauthorized", 401);
      c.set("sync" as never, current satisfies SyncContext as never);
      await next();
    },
    upgradeWebSocket((c) => {
      const context = c.get("sync" as never) as SyncContext;
      const token = context.session.token;
      let connection: ReturnType<typeof hocuspocus.handleConnection> | undefined;
      return {
        onOpen(_event, ws) {
          const sockets = socketsBySession.get(token) ?? new Set();
          sockets.add(ws);
          socketsBySession.set(token, sockets);
          connection = hocuspocus.handleConnection(ws.raw as WebSocketLike, c.req.raw, context);
        },
        onMessage(event) {
          connection?.handleMessage(new Uint8Array(event.data as ArrayBuffer));
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

  const wss = new WebSocketServer({ noServer: true });
  const server = serve({ fetch: app.fetch, port, websocket: { server: wss } });
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return {
    port: (server.address() as AddressInfo).port,
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
