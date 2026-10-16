// Test helpers for the sync boundary, shared by the server's sync tests and the e2e tests.
//
//   const server = new TestServer();          // a real server process with its own data directory
//   await server.start();
//   const olive = await server.addPerson("Olive");                 // the first person is the owner
//   const max = await server.addPerson("Max", "member", olive);    // added by the owner
//   const client = await connectAs(server, max);                    // a Node client connected as Max
//   await client.syncAll();                                         // ["index:<max id>", "page:…"]
//   client.received(); client.denied(); client.pageTitles(); client.sidebar();
//   await client.share(pageId, personId, "view"); await client.shareWithWorkspace(pageId, "edit");
//   client.level(pageId); client.access(pageId); client.closedReason(name);
//   await client.close(); await server.stop();
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import {
  buildTree, createPage, indexDocName, pageDocName, parseDocName, privateSection, readIndex, readIndexLevels,
  readMeta, setPersonAccess, setWorkspaceAccess, sidebarSections,
  type AccessLevel, type PageAccess, type PageDocs, type PageMeta, type Person, type Role, type Tree, type TreeNode,
} from "@homelab/notes-access-sync-poc-model";
import * as Y from "yjs";

export { indexDocName, pageDocName };

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
  /** Why the server closed this document's connection, if it did (Hocuspocus passes only the reason on). */
  closedReason?: string;
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
    return this.entry(name).result;
  }

  /** Starts a provider for `name` (once), so a page this device creates can be written before it syncs. */
  private entry(name: string): Entry {
    const existing = this.entries.get(name);
    if (existing) return existing;
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
      onClose: ({ event }) => {
        if (event.reason) entry.closedReason = event.reason;
      },
    });
    const entry: Entry = { doc, provider, result };
    this.entries.set(name, entry);
    provider.attach();
    return entry;
  }

  /**
   * Opens this person's page index, then every page document it lists, as the web app does, and
   * returns the names of the documents received. Call it again to follow later index changes.
   */
  async syncAll(): Promise<string[]> {
    const index = await this.open(indexDocName(this.person.id));
    if (index.status === "synced") {
      await Promise.all(readIndex(index.doc).map((id) => this.open(pageDocName(id))));
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

  /** The metadata of every received page document. */
  pages(): PageMeta[] {
    return this.received().flatMap((name) => {
      const ref = parseDocName(name);
      return ref?.kind === "page" ? (readMeta(ref.id, this.doc(name)!) ?? []) : [];
    });
  }

  /** This device's page tree, derived only from the page documents it received. */
  tree(): Tree {
    return buildTree(this.pages());
  }

  /** Titles of the live pages, in sidebar order (depth-first). */
  pageTitles(): string[] {
    const titles: string[] = [];
    const walk = (nodes: TreeNode[]) => nodes.forEach((n) => (titles.push(n.page.title), walk(n.children)));
    walk(this.tree().roots);
    return titles;
  }

  /** The top-level titles in each sidebar section. */
  sidebar(): { shared: string[]; private: string[] } {
    const s = sidebarSections(this.tree(), this.person.id);
    return { shared: s.shared.map((n) => n.page.title), private: s.private.map((n) => n.page.title) };
  }

  /** Everything in every received document as one string, for asserting that no trace of something arrived. */
  receivedContent(): string {
    return this.received()
      .map((name) => {
        const doc = this.doc(name)!;
        return JSON.stringify(doc.toJSON()) + doc.getXmlFragment("content").toString();
      })
      .join("\n");
  }

  /** The plain text of a received page, one line per block. */
  pageText(pageId: string): string | undefined {
    const doc = this.doc(pageDocName(pageId));
    return doc && blockText(doc.getXmlFragment("content"));
  }

  /**
   * Creates a page in a document of its own, with `body` as its first paragraph, and waits for the
   * server to accept it. Top-level pages go in this person's Private section. Returns its id.
   */
  async createPage(title: string, body = "", parentId: string | null = null): Promise<string> {
    const docs: PageDocs = {
      get: (id) => this.doc(pageDocName(id)),
      create: (id) => this.entry(pageDocName(id)).doc,
    };
    const id = createPage(docs, this.tree(), { title, parentId, section: privateSection(this.person.id) });
    const page = await this.open(pageDocName(id));
    if (page.status !== "synced") throw new Error(`page denied: ${page.reason}`);
    if (body) writeParagraph(page.doc, body);
    return id;
  }

  /** Appends a paragraph to a received page. */
  async writeText(pageId: string, text: string): Promise<void> {
    writeParagraph(this.receivedPage(pageId), text);
  }

  /** Invites `personId` to a received page at `level` (null: Restore inherited access). The server decides whether it sticks. */
  async share(pageId: string, personId: string, level: AccessLevel | null): Promise<void> {
    setPersonAccess(this.receivedPage(pageId), personId, level);
  }

  /** Sets a received page's general access for everyone in the workspace (null: inherit it). */
  async shareWithWorkspace(pageId: string, level: AccessLevel | null): Promise<void> {
    setWorkspaceAccess(this.receivedPage(pageId), level);
  }

  /** The access set on a received page itself, as this device holds it. */
  access(pageId: string): PageAccess | undefined {
    return readMeta(pageId, this.receivedPage(pageId))?.access;
  }

  /** This person's level on a page, as their page index says. */
  level(pageId: string): AccessLevel | undefined {
    const index = this.doc(indexDocName(this.person.id));
    return index && readIndexLevels(index).get(pageId);
  }

  /** Why the server closed a document's connection, or undefined. */
  closedReason(name: string): string | undefined {
    return this.entries.get(name)?.closedReason;
  }

  private receivedPage(pageId: string): Y.Doc {
    const doc = this.doc(pageDocName(pageId));
    if (!doc) throw new Error(`page ${pageId} was not received`);
    return doc;
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
