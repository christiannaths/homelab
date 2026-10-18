import { mkdtempSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  HocuspocusProvider,
  HocuspocusProviderWebsocket,
} from "@hocuspocus/provider";
import { WebSocket } from "ws";
import * as Y from "yjs";
import { startServer, type NotesServer } from "../src/server.ts";
import {
  CLIENT_ID,
  CLIENT_SECRET,
  StandInVoidAuth,
  type Account,
} from "./stand-in-voidauth.ts";

export const DAY_MS = 24 * 3600 * 1000;

export const OWNER: Account = {
  sub: "sub-owner",
  name: "Alex",
  groups: ["auth_admins"],
};
export const OTHER_ADMIN: Account = {
  sub: "sub-admin-2",
  name: "Robin",
  groups: ["auth_admins"],
};
export const STRANGER: Account = {
  sub: "sub-stranger",
  name: "Sam",
  groups: [],
};

export interface TestServer extends NotesServer {
  url: string;
  dataDir: string;
  /** Moves the server's clock forward. */
  advance(ms: number): void;
}

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, resolve));
  const address = probe.address();
  if (typeof address !== "object" || address === null)
    throw new Error("Probe is not listening on a TCP port");
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return address.port;
}

export function tempDataDir(): string {
  return mkdtempSync(path.join(tmpdir(), "notes-server-"));
}

/** Starts a server on a free port; pass the same dataDir to simulate a restart. */
export async function start(
  voidauth: StandInVoidAuth,
  dataDir = tempDataDir(),
  clientDir?: string,
): Promise<TestServer> {
  let offset = 0;
  const port = await freePort();
  const url = `http://localhost:${port}`;
  const server = await startServer({
    dataDir,
    port,
    publicUrl: url,
    clientDir,
    oidc: {
      issuer: voidauth.issuer,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    },
    now: () => Date.now() + offset,
  });
  return { ...server, url, dataDir, advance: (ms) => (offset += ms) };
}

export interface SignInResult {
  status: number;
  body: unknown;
  /** The session cookie as a browser would send it, if one was set. */
  cookie: string | undefined;
  setCookie: string[];
}

/** Walks the sign-in redirects as a browser would, with `account` signing in on VoidAuth. */
export async function signIn(
  server: TestServer,
  voidauth: StandInVoidAuth,
  account: Account | undefined,
) {
  voidauth.account = account;
  const started = await fetch(`${server.url}/api/sign-in`, {
    redirect: "manual",
  });
  const pending = started.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const atVoidAuth = await fetch(started.headers.get("location")!, {
    redirect: "manual",
  });
  return callback(server, atVoidAuth.headers.get("location")!, pending);
}

/** Calls Notes' sign-in callback with the given location and cookies. */
export async function callback(
  server: TestServer,
  location: string,
  cookie: string,
): Promise<SignInResult> {
  const response = await fetch(location, {
    redirect: "manual",
    headers: { cookie },
  });
  const setCookie = response.headers.getSetCookie();
  const session = setCookie.find(
    (c) => c.startsWith("notes_session=") && !c.startsWith("notes_session=;"),
  );
  return {
    status: response.status,
    body:
      response.status === 302
        ? response.headers.get("location")
        : await response.json(),
    cookie: session?.split(";")[0],
    setCookie,
  };
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
  open(name: string): {
    doc: Y.Doc;
    provider: HocuspocusProvider;
    synced: Promise<void>;
    denied: Promise<string>;
  };
  closed: Promise<number>;
  destroy(): void;
}

/** One device: one socket carrying many documents, as the PWA will. */
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
        // The session travels in the cookie; Hocuspocus still sends a token per document.
        token: "cookie",
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

export async function waitFor(
  check: () => boolean,
  timeoutMs = 5000,
): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** Opens a raw WebSocket to /sync and reports how the upgrade went. */
export function tryUpgrade(
  server: TestServer,
  cookie?: string,
): Promise<"open" | number> {
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
