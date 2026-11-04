import {
  HocuspocusProvider,
  HocuspocusProviderWebsocket,
} from "@hocuspocus/provider";
import { clearDocument, IndexeddbPersistence } from "y-indexeddb";
import { REFUSALS } from "@homelab/notes-model";
import * as Y from "yjs";

/** Why the server closes a document whose update it refused (ADR-NOTE-010). */
const REFUSED = new Set<string>(REFUSALS);
/** Why the server refuses or closes a document the person may no longer open. */
const LOST = new Set(["no-access", "access-revoked"]);

interface Entry {
  doc: Y.Doc;
  local: IndexeddbPersistence;
  provider?: HocuspocusProvider;
  /** Set once the entry is thrown away, so a provider is not started for it after all. */
  closed: boolean;
  /** Whether it has synced with the server since it was opened. */
  synced: boolean;
}

/**
 * One person's documents on this device (ADR-NOTE-010): each has a local copy in IndexedDB,
 * loaded before it starts syncing, and all of them sync over one socket. Works the same online
 * and offline; the socket keeps trying to connect.
 */
export class DocumentSync {
  readonly #socket: HocuspocusProviderWebsocket;
  readonly #personId: string;
  readonly #entries = new Map<string, Entry>();
  readonly #listeners = new Set<(name: string) => void>();

  constructor(url: string, personId: string) {
    this.#personId = personId;
    this.#socket = new HocuspocusProviderWebsocket({
      url,
      // Offline is a normal state, not an error.
      maxAttempts: 0,
      maxDelay: 10_000,
    });
    addEventListener("offline", () => this.#goOffline());
    addEventListener("online", () => void this.#socket.connect());
  }

  /**
   * The document called `name`, opened if it was not already. Its local copy may still be
   * loading; changes apply as they arrive.
   */
  open(name: string): Y.Doc {
    const existing = this.#entries.get(name);
    if (existing) return existing.doc;
    const doc = new Y.Doc();
    const entry: Entry = {
      doc,
      local: new IndexeddbPersistence(this.#storeName(name), doc),
      closed: false,
      synced: false,
    };
    this.#entries.set(name, entry);
    // ADR-NOTE-010: started after the local copy loads, so the stored copy rides the handshake.
    // A copy that can't be read (storage blocked) still syncs from the server.
    void entry.local.whenSynced
      .catch(() => undefined)
      .then(() => {
        if (entry.closed) return;
        this.#connect(name, entry);
        this.#notify(name);
      });
    return doc;
  }

  /** The document called `name` if it is open. */
  get(name: string): Y.Doc | undefined {
    return this.#entries.get(name)?.doc;
  }

  /** Whether `name` is open and has synced with the server since it was opened. */
  hasSynced(name: string): boolean {
    return this.#entries.get(name)?.synced ?? false;
  }

  /**
   * Whether `name` is open with its local copy loaded, so an editor bound to it starts from
   * what this device has rather than from nothing.
   */
  isLoaded(name: string): boolean {
    return this.#entries.get(name)?.provider !== undefined;
  }

  /** Who else has `name` open, for collaborators' cursors; set once it is loaded. */
  awareness(
    name: string,
  ): NonNullable<HocuspocusProvider["awareness"]> | undefined {
    return this.#entries.get(name)?.provider?.awareness ?? undefined;
  }

  /**
   * The names of this person's documents stored on this device, whether or not they are open.
   * Empty where the browser can't list its databases.
   */
  async storedNames(): Promise<string[]> {
    const prefix = this.#storeName("");
    try {
      const databases = await indexedDB.databases();
      return databases
        .map((db) => db.name ?? "")
        .filter((name) => name.startsWith(prefix))
        .map((name) => name.slice(prefix.length));
    } catch {
      return [];
    }
  }

  /** Stops syncing `name` and deletes this device's copy of it. */
  async forget(name: string): Promise<void> {
    const entry = this.#entries.get(name);
    if (entry) {
      this.#entries.delete(name);
      await this.#discard(entry);
    }
    await clearDocument(this.#storeName(name));
    this.#notify(name);
  }

  /**
   * Calls `listener` with a document's name when its local copy has loaded, it first syncs, it
   * is replaced by a fresh copy, or it is forgotten. Changes to its content are the document's own events.
   */
  onStateChange(listener: (name: string) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #connect(name: string, entry: Entry): void {
    entry.provider = new HocuspocusProvider({
      websocketProvider: this.#socket,
      name,
      document: entry.doc,
      // The person travels in the gateway's headers; Hocuspocus still sends a token per document.
      token: "gateway",
      // Each provider gets its own address on the socket, so a document reopened right after a
      // refusal is not mistaken for the old one, which the server may still be closing.
      sessionAwareness: true,
      onSynced: () => {
        if (entry.synced) return;
        entry.synced = true;
        this.#notify(name);
      },
      onClose: ({ event }) => this.#closedByServer(name, entry, event.reason),
      onAuthenticationFailed: ({ reason }) =>
        this.#closedByServer(name, entry, reason),
    });
    // Providers on a shared socket must be attached explicitly.
    entry.provider.attach();
  }

  #closedByServer(name: string, entry: Entry, reason: string): void {
    if (this.#entries.get(name) !== entry) return;
    if (LOST.has(reason)) void this.forget(name);
    else if (REFUSED.has(reason)) void this.#resync(name);
  }

  /**
   * ADR-NOTE-010: a refused update can't be taken back, so this device's copy is thrown away and
   * the document is opened again from the server's.
   */
  async #resync(name: string): Promise<void> {
    await this.forget(name);
    this.open(name);
  }

  async #discard(entry: Entry): Promise<void> {
    entry.closed = true;
    entry.provider?.destroy();
    // Closes the database too, so it can be deleted.
    await entry.local.destroy();
    entry.doc.destroy();
  }

  /**
   * With the network gone the socket's closing handshake can't finish, and it can sit in CLOSING
   * for about 30 s while the provider still says it is connected (ADR-NOTE-010). Dispatching the
   * close finishes it now; the real one, when it comes, is ignored.
   */
  #goOffline(): void {
    const ws = this.#socket.webSocket;
    this.#socket.disconnect();
    if (
      ws &&
      ws.readyState !== WebSocket.CLOSED &&
      this.#socket.webSocket === ws
    )
      ws.dispatchEvent(
        new CloseEvent("close", { code: 1000, reason: "offline" }),
      );
  }

  #notify(name: string): void {
    for (const listener of this.#listeners) listener(name);
  }

  /** Where this person's copy of a document lives in IndexedDB, apart from anyone else's. */
  #storeName(name: string): string {
    return `notes:${this.#personId}:${name}`;
  }
}
