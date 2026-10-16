// Test helpers for the sync boundary, shared by the server's sync tests and the e2e tests.
//
//   const server = new TestServer();          // a real server process with its own data directory
//   await server.start();
//   const olive = await server.addPerson("Olive");                 // the first person is the owner
//   const max = await server.addPerson("Max", "member", olive);    // added by the owner
//   const client = await connectAs(server, max);                    // a Node client connected as Max
//   await client.syncAll();                                         // ["workspace:default", "page:…"]
//   client.received(); client.denied(); client.pageTitles();
//   await client.close(); await server.stop();
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import {
  buildTree, createPage, pageDocName, pagesMap, readPages, WORKSPACE_DOC,
  type Person, type Role,
} from "@homelab/notes-access-sync-poc-model";
import * as Y from "yjs";

export { WORKSPACE_DOC, pageDocName };

const serverDir = path.resolve(import.meta.dirname, "..");
const defaultWebRoot = path.resolve(serverDir, "../web/dist");

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

/** A connection to a document, as the server sees it. */
export interface ServerConnection {
  personId: string;
  documentName: string;
}

/**
 * A real server process (`node src/index.ts`) with its own port and data directory.
 * `stop()` and `start()` again keep the data, so a test can restart the server.
 */
export class TestServer {
  /** Server output, kept so tests can assert on warnings. */
  readonly logs: string[] = [];
  readonly dataDir: string;
  readonly webRoot: string;
  /** Copy server output to this process's stdout. */
  private readonly echo: boolean;
  private port = 0;
  private proc: ChildProcess | null = null;

  constructor(opts: { dataDir?: string; webRoot?: string; echo?: boolean } = {}) {
    this.dataDir = opts.dataDir ?? mkdtempSync(path.join(tmpdir(), "notes-access-"));
    this.webRoot = opts.webRoot ?? defaultWebRoot;
    this.echo = opts.echo ?? false;
  }

  get url(): string {
    return `http://localhost:${this.port}`;
  }

  get syncUrl(): string {
    return `ws://localhost:${this.port}/sync`;
  }

  async start(): Promise<void> {
    if (!this.port) this.port = await freePort();
    this.proc = spawn(process.execPath, ["--no-experimental-webstorage", "src/index.ts"], {
      cwd: serverDir,
      env: { ...process.env, PORT: String(this.port), DATA_DIR: this.dataDir, WEB_ROOT: this.webRoot },
      stdio: ["ignore", "pipe", "pipe"],
    });
    for (const stream of [this.proc.stdout!, this.proc.stderr!]) {
      stream.on("data", (chunk: Buffer) => {
        if (this.echo) process.stdout.write(chunk);
        this.logs.push(...chunk.toString().split("\n").filter(Boolean));
      });
    }
    for (let i = 0; i < 100; i++) {
      if (this.proc.exitCode !== null) break;
      try {
        if ((await fetch(`${this.url}/api/health`)).ok) return;
      } catch {
        // not up yet
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`server did not start:\n${this.logs.join("\n")}`);
  }

  async stop(): Promise<void> {
    const proc = this.proc;
    this.proc = null;
    if (!proc || proc.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      proc.once("exit", () => resolve());
      proc.kill("SIGTERM");
    });
  }

  async people(): Promise<Person[]> {
    return (await fetch(`${this.url}/api/people`)).json();
  }

  /** Adds a person, as `actor` (who must be an owner once the workspace has one). */
  async addPerson(name: string, role: Role = "member", actor?: Person): Promise<Person> {
    const res = await fetch(`${this.url}/api/people`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(actor ? { Authorization: `Bearer ${actor.id}` } : {}),
      },
      body: JSON.stringify({ name, role }),
    });
    if (!res.ok) throw new Error(`addPerson failed (${res.status}): ${await res.text()}`);
    return res.json();
  }

  /** Every open document connection, with the person it belongs to. */
  async connections(): Promise<ServerConnection[]> {
    return (await fetch(`${this.url}/api/connections`)).json();
  }
}

/** How the server answered a request to open a document. `scope` is "read-write" or "readonly". */
export type OpenResult = { status: "synced"; doc: Y.Doc; scope: string } | { status: "denied"; reason: string };

interface Entry {
  doc: Y.Doc;
  provider: HocuspocusProvider;
  result: Promise<OpenResult>;
  status?: OpenResult["status"];
  scope?: string;
}

/**
 * A device connected as one person, with no local storage: one WebSocket, one provider per
 * document, the same as the web app. It records which documents the server sent it and which
 * it refused.
 */
export class TestClient {
  private readonly socket: HocuspocusProviderWebsocket;
  private readonly entries = new Map<string, Entry>();

  readonly person: Pick<Person, "id"> & Partial<Person>;

  constructor(person: Pick<Person, "id"> & Partial<Person>, syncUrl: string) {
    this.person = person;
    this.socket = new HocuspocusProviderWebsocket({ url: syncUrl, maxAttempts: 0 });
  }

  /** Opens a document and waits until the server has synced it or refused it. */
  open(name: string): Promise<OpenResult> {
    const existing = this.entries.get(name);
    if (existing) return existing.result;
    const doc = new Y.Doc();
    let settle!: (r: OpenResult) => void;
    const result = new Promise<OpenResult>((resolve) => (settle = resolve));
    const provider = new HocuspocusProvider({
      websocketProvider: this.socket,
      name,
      document: doc,
      token: this.person.id,
      onAuthenticated: ({ scope }) => {
        entry.scope = scope;
      },
      onSynced: () => {
        entry.status ??= "synced";
        settle({ status: "synced", doc, scope: entry.scope ?? "read-write" });
      },
      onAuthenticationFailed: ({ reason }) => {
        entry.status = "denied";
        settle({ status: "denied", reason });
      },
    });
    const entry: Entry = { doc, provider, result };
    this.entries.set(name, entry);
    provider.attach();
    return result;
  }

  /**
   * Opens the workspace document, then every page document it lists, as the web app does,
   * and returns the names of the documents received.
   */
  async syncAll(): Promise<string[]> {
    const workspace = await this.open(WORKSPACE_DOC);
    if (workspace.status === "synced") {
      await Promise.all([...pagesMap(workspace.doc).keys()].map((id) => this.open(pageDocName(id))));
    }
    return this.received();
  }

  /** Names of the documents the server has sent, sorted. */
  received(): string[] {
    return this.namesWith("synced");
  }

  /** Names of the documents the server refused, sorted. */
  denied(): string[] {
    return this.namesWith("denied");
  }

  /** A received document, or undefined. */
  doc(name: string): Y.Doc | undefined {
    const entry = this.entries.get(name);
    return entry?.status === "synced" ? entry.doc : undefined;
  }

  /** Titles of the live pages in the received workspace document, in sidebar order (depth-first). */
  pageTitles(): string[] {
    const workspace = this.doc(WORKSPACE_DOC);
    if (!workspace) return [];
    const titles: string[] = [];
    const walk = (nodes: ReturnType<typeof buildTree>["roots"]) =>
      nodes.forEach((n) => (titles.push(n.page.title), walk(n.children)));
    walk(buildTree(readPages(workspace)).roots);
    return titles;
  }

  /** The plain text of a received page, one line per block. */
  pageText(pageId: string): string | undefined {
    const doc = this.doc(pageDocName(pageId));
    return doc && blockText(doc.getXmlFragment("content"));
  }

  /** Creates a page in the workspace document, with `body` as its first paragraph. Returns its id. */
  async createPage(title: string, body = "", parentId: string | null = null): Promise<string> {
    const workspace = await this.open(WORKSPACE_DOC);
    if (workspace.status !== "synced") throw new Error(`workspace denied: ${workspace.reason}`);
    const id = createPage(workspace.doc, buildTree(readPages(workspace.doc)), { title, parentId });
    const page = await this.open(pageDocName(id));
    if (page.status !== "synced") throw new Error(`page denied: ${page.reason}`);
    if (body) writeParagraph(page.doc, body);
    return id;
  }

  /** Waits until the server has acknowledged every local change. */
  async settled(timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while ([...this.entries.values()].some((e) => e.provider.hasUnsyncedChanges)) {
      if (Date.now() > deadline) throw new Error("changes did not sync");
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  async close(): Promise<void> {
    for (const e of this.entries.values()) e.provider.destroy();
    this.socket.destroy();
  }

  private namesWith(status: OpenResult["status"]): string[] {
    return [...this.entries].filter(([, e]) => e.status === status).map(([name]) => name).sort();
  }
}

/** Connects a test device as `person` (only the id is used: it is the connection token). */
export async function connectAs(
  server: Pick<TestServer, "syncUrl">,
  person: Pick<Person, "id"> & Partial<Person>,
): Promise<TestClient> {
  return new TestClient(person, server.syncUrl);
}

/** Appends a paragraph shaped the way BlockNote stores one, so the web editor can open it. */
function writeParagraph(doc: Y.Doc, text: string): void {
  const fragment = doc.getXmlFragment("content");
  doc.transact(() => {
    let group = fragment.get(0) as Y.XmlElement | undefined;
    if (!group) {
      group = new Y.XmlElement("blockGroup");
      fragment.insert(0, [group]);
    }
    const container = new Y.XmlElement("blockContainer");
    container.setAttribute("id", crypto.randomUUID());
    const paragraph = new Y.XmlElement("paragraph");
    paragraph.setAttribute("backgroundColor", "default");
    paragraph.setAttribute("textColor", "default");
    paragraph.setAttribute("textAlignment", "left");
    paragraph.insert(0, [new Y.XmlText(text)]);
    container.insert(0, [paragraph]);
    group.insert(group.length, [container]);
  });
}

/** Text of each block-level element that holds text, joined by newlines. */
function blockText(node: Y.XmlFragment | Y.XmlElement): string {
  const lines: string[] = [];
  const walk = (n: Y.XmlFragment | Y.XmlElement) => {
    const texts = n.toArray().filter((c): c is Y.XmlText => c instanceof Y.XmlText);
    if (texts.length) lines.push(texts.map((t) => t.toString()).join(""));
    for (const c of n.toArray()) if (c instanceof Y.XmlElement) walk(c);
  };
  walk(node);
  return lines.join("\n");
}
