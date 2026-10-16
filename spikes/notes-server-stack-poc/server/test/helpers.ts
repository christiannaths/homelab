import { mkdtempSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { WebSocket } from "ws";
import * as Y from "yjs";
import { startServer } from "../src/app.ts";

export const SECRET = "test-secret-test-secret-test-secret";
export const PASSWORD = "correct horse battery staple";

export type TestServer = Awaited<ReturnType<typeof startServer>> & { url: string };

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, resolve));
  const { port } = probe.address() as { port: number };
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

export function tempDataDir(): string {
  return mkdtempSync(path.join(tmpdir(), "notes-server-stack-"));
}

/** Starts a server on a free port; pass the same dataDir to simulate a restart. */
export async function start(dataDir = tempDataDir()): Promise<TestServer & { dataDir: string }> {
  const port = await freePort();
  const url = `http://localhost:${port}`;
  const server = await startServer({
    dataDir,
    webRoot: path.join(import.meta.dirname, "../public"),
    port,
    baseURL: url,
    secret: SECRET,
  });
  return { ...server, url, dataDir };
}

export async function post(server: TestServer, route: string, body: unknown, cookie?: string) {
  return fetch(server.url + route, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: server.url,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

/** Signs in and returns the session cookie, as a browser would store it. */
export async function signIn(server: TestServer, username: string, password = PASSWORD) {
  const res = await post(server, "/api/auth/sign-in/username", { username, password });
  if (!res.ok) throw new Error(`sign-in failed: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie")!;
  return { cookie: setCookie.split(";")[0], setCookie, body: await res.json() };
}

export async function setUpAdmin(server: TestServer, username = "admin") {
  const res = await post(server, "/api/setup", { username, password: PASSWORD });
  if (!res.ok) throw new Error(`setup failed: ${res.status}`);
  return signIn(server, username);
}

/** Creates a member account as the signed-in admin, through Better Auth's admin plugin. */
export async function createMember(server: TestServer, adminCookie: string, username: string) {
  const res = await post(
    server,
    "/api/auth/admin/create-user",
    { email: `${username}@users.invalid`, password: PASSWORD, name: username, data: { username } },
    adminCookie,
  );
  if (!res.ok) throw new Error(`create-user failed: ${res.status} ${await res.text()}`);
  return signIn(server, username);
}

/** A WebSocket that sends the session cookie on the upgrade request, as a same-origin browser does. */
function cookieWebSocket(cookie: string) {
  return class extends WebSocket {
    constructor(url: string, protocols?: string | string[]) {
      super(url, protocols, { headers: { cookie } });
    }
  };
}

export interface Device {
  socket: HocuspocusProviderWebsocket;
  open(name: string): { doc: Y.Doc; provider: HocuspocusProvider; synced: Promise<void>; denied: Promise<string> };
  closed: Promise<number>;
  destroy(): void;
}

/** One device: one socket carrying many documents, like the PWA's SyncManager. */
export function device(server: TestServer, cookie: string): Device {
  let resolveClosed: (code: number) => void;
  const closed = new Promise<number>((resolve) => (resolveClosed = resolve));
  const socket = new HocuspocusProviderWebsocket({
    url: server.url.replace("http", "ws") + "/sync",
    WebSocketPolyfill: cookieWebSocket(cookie),
    // Tests check one connection attempt at a time.
    maxAttempts: 1,
    onClose: ({ event }) => resolveClosed(event.code),
  });
  const providers: HocuspocusProvider[] = [];
  return {
    socket,
    closed,
    open(name) {
      const doc = new Y.Doc();
      let onSynced!: () => void;
      let onDenied!: (reason: string) => void;
      const synced = new Promise<void>((resolve) => (onSynced = resolve));
      const denied = new Promise<string>((resolve) => (onDenied = resolve));
      const provider = new HocuspocusProvider({
        websocketProvider: socket,
        name,
        document: doc,
        token: "session-cookie",
        onSynced: () => onSynced(),
        onAuthenticationFailed: ({ reason }) => onDenied(reason),
      });
      provider.attach();
      providers.push(provider);
      return { doc, provider, synced, denied };
    },
    destroy() {
      for (const p of providers) p.destroy();
      socket.destroy();
    },
  };
}

export async function waitFor(check: () => boolean, timeoutMs = 5000): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** Opens a raw WebSocket to /sync and reports how the upgrade went. */
export function tryUpgrade(server: TestServer, cookie?: string): Promise<"open" | number> {
  return new Promise((resolve) => {
    const ws = new WebSocket(server.url.replace("http", "ws") + "/sync", {
      headers: cookie ? { cookie } : {},
    });
    ws.on("open", () => {
      ws.close();
      resolve("open");
    });
    ws.on("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
    ws.on("error", () => {});
  });
}
