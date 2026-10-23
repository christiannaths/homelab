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

/** Who the gateway says is signing in, as VoidAuth would tell it. */
export interface Account {
  username: string;
  name?: string;
  groups: string[];
}

export const OWNER: Account = {
  username: "alex",
  name: "Alex",
  groups: ["notes-admins"],
};
export const MEMBER: Account = {
  username: "sam",
  name: "Sam",
  groups: ["notes"],
};
/** A homelab admin, whom VoidAuth lets into every app whatever its groups. */
export const HOMELAB_ADMIN: Account = {
  username: "auth_admin",
  groups: ["auth_admins"],
};

/** The headers the gateway adds after VoidAuth lets a request through. */
export function gatewayHeaders(account: Account): Record<string, string> {
  return {
    "remote-user": account.username,
    ...(account.name && { "remote-name": encodeURIComponent(account.name) }),
    ...(account.groups.length && { "remote-groups": account.groups.join(",") }),
  };
}

export interface TestServer extends NotesServer {
  url: string;
  dataDir: string;
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
  dataDir = tempDataDir(),
  clientDir?: string,
): Promise<TestServer> {
  const port = await freePort();
  const server = await startServer({
    dataDir,
    port,
    clientDir,
  });
  return { ...server, url: `http://localhost:${port}`, dataDir };
}

/** A request as it arrives from the gateway, or straight from the network without `account`. */
export function request(
  server: TestServer,
  route: string,
  account?: Account,
): Promise<Response> {
  return fetch(`${server.url}${route}`, {
    redirect: "manual",
    headers: account ? gatewayHeaders(account) : {},
  });
}

/** A WebSocket whose upgrade request carries the gateway's headers. */
function gatewayWebSocket(account: Account) {
  return class extends WebSocket {
    constructor(url: string, protocols?: string | string[]) {
      super(url, protocols, { headers: gatewayHeaders(account) });
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
export function device(server: TestServer, account: Account): Device {
  let resolveClosed: (code: number) => void;
  const closed = new Promise<number>((resolve) => (resolveClosed = resolve));
  const socket = new HocuspocusProviderWebsocket({
    url: server.url.replace("http", "ws") + "/sync",
    WebSocketPolyfill: gatewayWebSocket(account),
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
        // The person travels in the gateway's headers; Hocuspocus still sends a token per document.
        token: "gateway",
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
  account?: Account,
): Promise<"open" | number> {
  return new Promise((resolve) => {
    const ws = new WebSocket(server.url.replace("http", "ws") + "/sync", {
      headers: account ? gatewayHeaders(account) : {},
    });
    ws.on("open", () => {
      ws.close();
      resolve("open");
    });
    ws.on("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
    ws.on("error", () => {});
  });
}
