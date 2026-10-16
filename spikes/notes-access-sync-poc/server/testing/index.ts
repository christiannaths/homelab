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
//   await client.move(pageId, parentId, { section }); client.level(pageId); client.access(pageId);
//   client.closedReason(name); client.refusals(name);
//   const db = await client.createDatabase("Chores", { Points: "number" });   // { id, properties: { Points: <id> } }
//   const row = await client.addRow(db.id, "Dishes", { [db.properties.Points]: 3 }, "body");
//   await client.setCell(row, propId, 4); await client.setView(db.id, { filter }); await client.renameProperty(db.id, propId, name);
//   client.table(db.id); client.row(row); client.view(db.id); client.properties(db.id);
//   await client.disconnect(); await client.connect(); await client.reconnect();   // offline, back online
//   await server.refusals();                                        // every update the server refused
//   await client.close(); await server.stop();
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import {
  buildTree, createPage, isRefusal, indexDocName, indexMap, pageDocName, parseDocName, privateSection, readIndex,
  movePage, readIndexLevels, readMeta, renamePage, setPersonAccess, setWorkspaceAccess, sidebarSections,
  type AccessLevel, type PageAccess, type PageDocs, type PageMeta, type Person, type Role, type Tree, type TreeNode,
} from "@homelab/notes-access-sync-poc-model";
import {
  createTeamspace, readTeamspace, readTeamspaceIndex, setTeamspaceAccess, setTeamspaceMember, setTeamspaceSettings, teamspaceDocName,
  teamspaceSection, type Teamspace, type TeamspaceKind, type TeamspaceRole,
} from "@homelab/notes-access-sync-poc-model";
import {
  addProperty, addRow, createDatabase, databaseTable, readCells, readProperties, readView, renameProperty, schemaDocName,
  setCell, setView, type CellValue, type PropertyType, type TableRow, type ViewSettings,
} from "@homelab/notes-access-sync-poc-model";
import * as Y from "yjs";

export { indexDocName, pageDocName, privateSection, schemaDocName, teamspaceDocName };

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

/** An update the server refused, and why (a `Refusal` from the model). */
export interface ServerRefusal {
  personId: string;
  documentName: string;
  reason: string;
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

  /** Every update the server refused since it started, oldest first. */
  async refusals(): Promise<ServerRefusal[]> {
    return (await fetch(`${this.url}/api/refusals`)).json();
  }
}

/** How the server answered a request to open a document. `scope` is "read-write" or "readonly". */
export type OpenResult = { status: "synced"; doc: Y.Doc; scope: string } | { status: "denied"; reason: string };

interface Entry {
  /** Settles `result`; a recovered entry passes its successor's result on. */
  settle: (r: OpenResult) => void;
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
  /** The reasons the server gave for each update it refused, per document, oldest first. */
  private readonly refused = new Map<string, string[]>();

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
    if (existing && existing.closedReason === undefined) return existing;
    // The server closed this document (access revoked). Opening it again keeps the local copy, as
    // a device with storage would, and asks the server afresh with a new provider.
    if (existing) existing.provider.destroy();
    const doc = existing?.doc ?? new Y.Doc();
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
        if (isRefusal(event.reason) && this.entries.get(name) === entry) this.recover(name, event.reason);
      },
      // Each provider gets its own address on the socket, so a document can be reopened right
      // after its old provider is destroyed (explore.md §3: otherwise the server may still be
      // closing the old one and ignore the new one's authentication).
      sessionAwareness: true,
    });
    const entry: Entry = { doc, provider, result, settle };
    this.entries.set(name, entry);
    provider.attach();
    return entry;
  }

  /**
   * The device's recovery from a refused update, the same as the web app's: the server applied
   * none of it and closed the document, so throw this copy away and open the document again from
   * the server's state. Nothing refused is left to send again.
   */
  private recover(name: string, reason: string): void {
    this.refused.set(name, [...(this.refused.get(name) ?? []), reason]);
    const old = this.entries.get(name)!;
    this.entries.delete(name);
    old.provider.destroy();
    old.doc.destroy();
    // Anyone still waiting for the old copy to open gets the new one.
    void this.entry(name).result.then(old.settle);
  }

  /**
   * Opens this person's page index, then every page document it lists, as the web app does, and
   * returns the names of the documents received. Call it again to follow later index changes.
   */
  async syncAll(): Promise<string[]> {
    const index = await this.open(indexDocName(this.person.id));
    if (index.status === "synced") {
      await Promise.all([
        ...readIndex(index.doc).map((id) => this.open(pageDocName(id))),
        ...[...readTeamspaceIndex(index.doc).keys()].map((id) => this.open(teamspaceDocName(id))),
      ]);
      // A database's properties: for each database received, and each row (which names its database).
      const databases = this.pages().flatMap((p) => (p.kind === "database" ? [p.id] : p.kind === "row" && p.parentId ? [p.parentId] : []));
      await Promise.all([...new Set(databases)].map((id) => this.open(schemaDocName(id))));
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
   * server to answer. Top-level pages go in this person's Private section unless `section` says
   * otherwise; `access` is set on the page as it is created. The page, its body and its access
   * reach the server as one update, the page's first. Returns its id.
   */
  async createPage(
    title: string,
    body = "",
    parentId: string | null = null,
    opts: { section?: string; access?: Record<string, AccessLevel> } = {},
  ): Promise<string> {
    const draft = new Y.Doc();
    const docs: PageDocs = { get: (id) => this.doc(pageDocName(id)), create: () => draft };
    const id = createPage(docs, this.tree(), { title, parentId, section: opts.section ?? privateSection(this.person.id) });
    if (body) writeParagraph(draft, body);
    for (const [personId, level] of Object.entries(opts.access ?? {})) setPersonAccess(draft, personId, level);
    Y.applyUpdate(this.entry(pageDocName(id)).doc, Y.encodeStateAsUpdate(draft));
    draft.destroy();
    const page = await this.open(pageDocName(id));
    if (page.status !== "synced") throw new Error(`page denied: ${page.reason}`);
    return id;
  }

  /** Appends a paragraph to a received page. */
  async writeText(pageId: string, text: string): Promise<void> {
    writeParagraph(this.receivedPage(pageId), text);
  }

  /** Moves a received page under `parentId` (null: the top level of `section`). The server decides whether it sticks. */
  async move(pageId: string, parentId: string | null, opts: { index?: number; section?: string } = {}): Promise<void> {
    const docs: PageDocs = { get: (id) => this.doc(pageDocName(id)), create: () => new Y.Doc() };
    this.receivedPage(pageId);
    if (!movePage(docs, this.tree(), pageId, parentId, opts.index ?? Number.MAX_SAFE_INTEGER, opts.section)) {
      throw new Error("move: not a valid move on this device's tree");
    }
  }

  /** Renames a received page. */
  async rename(pageId: string, title: string): Promise<void> {
    renamePage(this.receivedPage(pageId), title);
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

  /** The reasons the server gave for refusing this device's updates to a document, oldest first. */
  refusals(name: string): string[] {
    return this.refused.get(name) ?? [];
  }

  /** This person's page index as the device holds it: page id → level. */
  indexEntries(): Record<string, unknown> {
    const index = this.doc(indexDocName(this.person.id));
    return index ? indexMap(index).toJSON() : {};
  }

  /** Writes an entry into this person's page index, as a modified client might. Only the server may. */
  forgeIndexEntry(pageId: string, level: AccessLevel): void {
    const index = this.doc(indexDocName(this.person.id));
    if (!index) throw new Error("index not received");
    indexMap(index).set(pageId, level);
  }

  /**
   * Creates a database (#20) with `properties` (name → type), in this person's Private section
   * unless `parentId` or `section` says otherwise, and waits for the server to accept it. Returns
   * its id and its property ids by name.
   */
  async createDatabase(
    title: string,
    properties: Record<string, PropertyType> = {},
    opts: { parentId?: string | null; section?: string } = {},
  ): Promise<{ id: string; properties: Record<string, string> }> {
    const docs: PageDocs = { get: (id) => this.doc(pageDocName(id)), create: (id) => this.entry(pageDocName(id)).doc };
    const id = createDatabase(docs, this.tree(), {
      title, parentId: opts.parentId ?? null, section: opts.section ?? privateSection(this.person.id),
    });
    const page = await this.open(pageDocName(id));
    if (page.status !== "synced") throw new Error(`database denied: ${page.reason}`);
    const schema = this.entry(schemaDocName(id)).doc;
    const ids = Object.fromEntries(Object.entries(properties).map(([name, type]) => [name, addProperty(schema, name, type)]));
    const result = await this.open(schemaDocName(id));
    if (result.status !== "synced") throw new Error(`database properties denied: ${result.reason}`);
    await this.settled();
    return { id, properties: ids };
  }

  /**
   * Adds a row to a received database, with its cells (property id → value) and an optional body,
   * as one update. The server decides whether it sticks. Returns the row's id.
   */
  async addRow(databaseId: string, title: string, cells: Record<string, CellValue> = {}, body = ""): Promise<string> {
    this.receivedPage(databaseId);
    const draft = new Y.Doc();
    const id = addRow({ get: (pageId) => this.doc(pageDocName(pageId)), create: () => draft }, this.tree(), databaseId, { title, cells });
    if (body) writeParagraph(draft, body);
    Y.applyUpdate(this.entry(pageDocName(id)).doc, Y.encodeStateAsUpdate(draft));
    draft.destroy();
    await this.open(pageDocName(id));
    return id;
  }

  /** Sets a cell of a received row (null clears it). */
  async setCell(rowId: string, propertyId: string, value: CellValue | null): Promise<void> {
    setCell(this.receivedPage(rowId), propertyId, value);
  }

  /** Changes a received database's table view (sort, filter). */
  async setView(databaseId: string, changes: Partial<ViewSettings>): Promise<void> {
    setView(this.receivedPage(databaseId), changes);
  }

  /** Adds a property to a database whose properties this device received. Returns its id. */
  async addProperty(databaseId: string, name: string, type: PropertyType): Promise<string> {
    return addProperty(this.receivedSchema(databaseId), name, type);
  }

  /** Renames a property of a database whose properties this device received. */
  async renameProperty(databaseId: string, propertyId: string, name: string): Promise<void> {
    renameProperty(this.receivedSchema(databaseId), propertyId, name);
  }

  /** A received database's view settings. */
  view(databaseId: string): ViewSettings {
    return readView(this.receivedPage(databaseId));
  }

  /** The names of a database's properties, in order, as this device holds them. */
  properties(databaseId: string): string[] {
    return readProperties(this.receivedSchema(databaseId)).map((p) => p.name);
  }

  /** A received database as its table shows it on this device: each row's title and cells by property name. */
  table(databaseId: string): TableRow[] {
    const docs: PageDocs = { get: (id) => this.doc(pageDocName(id)), create: () => new Y.Doc() };
    return databaseTable(docs, this.tree(), databaseId, this.receivedSchema(databaseId));
  }

  /** A received row, as its page shows it: its title and its cells by property name. */
  row(rowId: string): TableRow {
    const doc = this.receivedPage(rowId);
    const meta = readMeta(rowId, doc)!;
    const cells = readCells(doc);
    const line: TableRow = { title: meta.title };
    for (const p of readProperties(this.receivedSchema(meta.parentId ?? ""))) line[p.name] = cells[p.id];
    return line;
  }

  private receivedSchema(databaseId: string): Y.Doc {
    const doc = this.doc(schemaDocName(databaseId));
    if (!doc) throw new Error(`the properties of database ${databaseId} were not received`);
    return doc;
  }

  /** Creates a teamspace owned by this person, waits for the server to accept it, and returns its id. */
  async createTeamspace(
    name: string,
    kind: TeamspaceKind,
    opts: { memberLevel?: AccessLevel; workspaceLevel?: AccessLevel; isDefault?: boolean } = {},
  ): Promise<string> {
    const id = crypto.randomUUID();
    createTeamspace(this.entry(teamspaceDocName(id)).doc, { name, kind, owner: this.person.id, ...opts });
    const result = await this.open(teamspaceDocName(id));
    if (result.status !== "synced") throw new Error(`teamspace denied: ${result.reason}`);
    await this.settled();
    return id;
  }

  /** Creates a top-level page in a teamspace (opening the teamspace first if needed) and returns its id. */
  async createTeamspacePage(teamspaceId: string, title: string, body = ""): Promise<string> {
    const docs: PageDocs = {
      get: (id) => this.doc(pageDocName(id)),
      create: (id) => this.entry(pageDocName(id)).doc,
    };
    const id = createPage(docs, this.tree(), { title, section: teamspaceSection(teamspaceId) });
    const page = await this.open(pageDocName(id));
    if (page.status !== "synced") throw new Error(`page denied: ${page.reason}`);
    if (body) writeParagraph(page.doc, body);
    return id;
  }

  /** Adds someone to a teamspace (or changes their role; null removes them). The server decides whether it sticks. */
  async addToTeamspace(teamspaceId: string, personId: string, role: TeamspaceRole | null = "member"): Promise<void> {
    const result = await this.open(teamspaceDocName(teamspaceId));
    if (result.status !== "synced") throw new Error(`teamspace denied: ${result.reason}`);
    setTeamspaceMember(result.doc, personId, role);
  }

  /** Joins a teamspace this device has received. */
  join(teamspaceId: string): Promise<void> {
    return this.addToTeamspace(teamspaceId, this.person.id, "member");
  }

  /** Leaves a teamspace. */
  leave(teamspaceId: string): Promise<void> {
    return this.addToTeamspace(teamspaceId, this.person.id, null);
  }

  /** Changes a received teamspace's settings. */
  async setTeamspace(teamspaceId: string, changes: Parameters<typeof setTeamspaceSettings>[1]): Promise<void> {
    setTeamspaceSettings(this.receivedTeamspace(teamspaceId), changes);
  }

  /** In a teamspace, overrides the level its members get on a received page and below (null: the teamspace's default). */
  async shareWithTeamspace(pageId: string, level: AccessLevel | null): Promise<void> {
    setTeamspaceAccess(this.receivedPage(pageId), level);
  }

  /** A received teamspace, as this device holds it. */
  teamspace(teamspaceId: string): Teamspace | null {
    const doc = this.doc(teamspaceDocName(teamspaceId));
    return doc ? readTeamspace(teamspaceId, doc) : null;
  }

  /** The names of the received teamspaces, sorted. */
  teamspaceNames(): string[] {
    return this.received()
      .flatMap((name) => {
        const ref = parseDocName(name);
        return ref?.kind === "teamspace" ? (this.teamspace(ref.teamspaceId)?.name ?? []) : [];
      })
      .sort();
  }

  /** The top-level page titles of each teamspace this device holds pages of, by teamspace name. */
  teamspaceSidebar(): Record<string, string[]> {
    const { teamspaces } = sidebarSections(this.tree(), this.person.id);
    return Object.fromEntries(
      [...teamspaces].map(([id, nodes]) => [this.teamspace(id)?.name ?? id, nodes.map((n) => n.page.title)]),
    );
  }

  private receivedTeamspace(teamspaceId: string): Y.Doc {
    const doc = this.doc(teamspaceDocName(teamspaceId));
    if (!doc) throw new Error(`teamspace ${teamspaceId} was not received`);
    return doc;
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

  /** Goes offline: the socket closes, and local edits wait for `connect()`. */
  async disconnect(timeoutMs = 10_000): Promise<void> {
    this.socket.disconnect();
    await waitFor(() => String(this.socket.status) === "disconnected", timeoutMs, "socket did not close");
  }

  /** Comes back online and waits until every document it holds has synced again. */
  async connect(timeoutMs = 10_000): Promise<void> {
    void this.socket.connect();
    await waitFor(
      () => [...this.entries.values()].every((e) => e.status === "denied" || e.provider.synced),
      timeoutMs,
      "documents did not sync again",
    );
  }

  /** Drops the connection and makes a new one, which syncs every document again. */
  async reconnect(): Promise<void> {
    await this.disconnect();
    await this.connect();
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

/** Waits until `done()` is true, polling; for setup hooks, where `expect.poll` isn't allowed. */
export async function waitFor(done: () => boolean | Promise<boolean>, timeoutMs = 10_000, message = "timed out"): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await done())) {
    if (Date.now() > deadline) throw new Error(message);
    await new Promise((r) => setTimeout(r, 20));
  }
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
