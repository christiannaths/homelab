import {
  HocuspocusProvider,
  HocuspocusProviderWebsocket,
  WebSocketStatus,
} from "@hocuspocus/provider";
import { isRefusal } from "@homelab/notes-access-sync-poc-model";
import { clearDocument, IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";

export type ConnectionState = "connecting" | "connected" | "disconnected";

/**
 * A document this device lost access to (#21), already deleted from memory and IndexedDB.
 * `unsynced` is the device's last copy of it (a full Yjs update) if it held edits the server
 * never acknowledged, so the app can offer them back; otherwise null.
 */
export interface LostDocument {
  name: string;
  unsynced: Uint8Array | null;
}

export interface DocEntry {
  name: string;
  doc: Y.Doc;
  /** Syncs the document with the server. Created once the local copy has loaded (`whenLocal`). */
  provider?: HocuspocusProvider;
  local: IndexeddbPersistence;
  /** Resolves once the local IndexedDB copy has been applied, with no network needed. */
  whenLocal: Promise<void>;
  localLoadedAt?: number;
  syncedAt?: number;
  synced: boolean;
  unsyncedChanges: number;
  /** How many times this document was thrown away and synced again after a refused update. */
  generation: number;
}

export interface SyncSnapshot {
  connection: ConnectionState;
  total: number;
  localLoaded: number;
  synced: number;
  pendingChanges: number;
  /** ms since the manager started; undefined until reached. */
  allLocalLoadedMs?: number;
  allSyncedMs?: number;
}

/**
 * Owns every Y.Doc on this device. Each doc is persisted to IndexedDB first and
 * synced to the server second, all over one shared WebSocket. The UI only ever
 * reads the local Y.Doc, so the app behaves the same online or offline.
 */
/** The most often listeners (the sync badge) are told about sync progress during a burst. */
const NOTIFY_INTERVAL_MS = 100;

export class SyncManager {
  readonly socket: HocuspocusProviderWebsocket;
  readonly startedAt = performance.now();
  private entries = new Map<string, DocEntry>();
  /** Entries thrown away (recovered, lost or wiped), whose provider must not be created any more. */
  private readonly discarded = new WeakSet<DocEntry>();
  private listeners = new Set<() => void>();
  private resetListeners = new Set<(name: string) => void>();
  private lostListeners = new Set<(lost: LostDocument) => void>();
  /**
   * Documents holding local edits the server hasn't acknowledged yet, kept in localStorage so it
   * survives a reload while offline. The provider's own counter starts at zero on every load.
   */
  private readonly unsynced: Set<string>;
  private connection: ConnectionState = "connecting";
  private snapshotCache: SyncSnapshot | null = null;
  private notifyScheduled = false;
  private notifiedAt = -Infinity;
  private allLocalLoadedMs?: number;
  private allSyncedMs?: number;

  /**
   * `personId` is the connection token (identity is faked) and also prefixes this device's
   * IndexedDB stores, so each person's local copy is kept apart.
   */
  constructor(
    url: string,
    private personId: string,
  ) {
    this.unsynced = new Set(readJson(this.unsyncedKey, parseStringList) ?? []);
    this.socket = new HocuspocusProviderWebsocket({
      url,
      // Keep retrying forever: offline is a normal state, not an error.
      maxAttempts: 0,
      maxDelay: 10_000,
      onStatus: ({ status }) => {
        this.connection = status;
        // Whatever was synced before is unconfirmed until each doc re-syncs after
        // reconnecting (the provider emits onSynced again). Without this, the badge
        // would say "Synced" right after reconnecting, before anything was exchanged.
        if (status !== WebSocketStatus.Connected)
          for (const e of this.entries.values()) e.synced = false;
        this.notify();
      },
    });
    // React to the OS's network state right away. Otherwise a dead socket is only
    // noticed after the provider's message timeout (~30s).
    addEventListener("offline", () => this.goOffline());
    addEventListener("online", () => {
      void this.socket.connect();
    });
  }

  /**
   * Closes the socket when the device goes offline. `disconnect()` only asks the WebSocket to
   * close, and with the network gone its closing handshake can't finish: the socket can sit in
   * CLOSING for about 30 s, and until its `close` event the provider still says "connected", so
   * the badge said "Synced" on an offline device (found in #22, 1 offline switch in 3 at 2,000
   * documents). So the close is finished here: a `close` event on the socket runs the provider's
   * own close handling (status, every document's provider), and the real one, when it comes, is
   * ignored because the provider has already let go of that socket.
   */
  private goOffline(): void {
    const ws = this.socket.webSocket;
    this.socket.disconnect();
    if (
      ws &&
      ws.readyState !== WebSocket.CLOSED &&
      this.socket.webSocket === ws
    ) {
      ws.dispatchEvent(
        new CloseEvent("close", { code: 1000, reason: "offline" }),
      );
    }
  }

  open(name: string): DocEntry {
    const existing = this.entries.get(name);
    if (existing) return existing;

    const doc = new Y.Doc();
    const local = new IndexeddbPersistence(this.storeName(name), doc);
    // The provider is only created once the local copy has loaded. A provider sends every change
    // it sees on the document as an update, including the stored copy IndexedDB applies when it
    // finishes loading after the provider has synced. On a document opened read-only (the
    // person's index, or a page at Can view) the server answers that update "not applied" even
    // though it adds nothing, so the change stayed pending and the badge said "Syncing" forever
    // (#22, about 1 warm reload in 5). Loaded first, the stored copy goes in the sync handshake
    // instead: its state vector tells the server what the device already has, so the server
    // sends only what is missing rather than every document in full on each start. Edits made
    // in the meantime are in the document, so the handshake carries them too.
    const connect = () => {
      if (this.discarded.has(entry)) return;
      const provider = createProvider();
      entry.provider = provider;
      // Since v2, providers on a shared socket must be attached explicitly.
      provider.attach();
    };
    const createProvider = () =>
      new HocuspocusProvider({
        websocketProvider: this.socket,
        name,
        document: doc,
        token: this.personId,
        // Each provider gets its own address on the socket, so a document can be reopened right
        // after its old provider is destroyed (a refused update #18, or access lost and regained
        // #21); otherwise the server may still be closing the old one and ignore the new one's
        // authentication.
        sessionAwareness: true,
        onSynced: () => {
          entry.synced = true;
          entry.syncedAt ??= performance.now() - this.startedAt;
          this.notify();
        },
        onUnsyncedChanges: ({ number }) => {
          entry.unsyncedChanges = number;
          // Zero only once the server has applied everything this device sent.
          if (number === 0) this.setUnsynced(name, false);
          this.notify();
        },
        onClose: ({ event }) => {
          // Losing access (#21): revoked while connected (or refused when (re)connecting, below).
          if (event.reason === "access-revoked") void this.lose(entry);
          // A refused update (#18): get back in step with the server.
          else if (isRefusal(event.reason) && this.entries.get(name) === entry)
            void this.recover(entry);
        },
        onAuthenticationFailed: ({ reason }) => {
          if (reason === "no-access") void this.lose(entry);
        },
      });
    // Edits made on this device (not ones arriving from the server or loaded from IndexedDB).
    doc.on("update", (_update: Uint8Array, origin: unknown) => {
      if (origin !== entry.provider && origin !== local)
        this.setUnsynced(name, true);
    });

    const entry: DocEntry = {
      name,
      doc,
      local,
      synced: false,
      unsyncedChanges: 0,
      generation: 0,
      // A local copy that can't be read (storage blocked) still syncs from the server.
      whenLocal: local.whenSynced
        .catch(() => undefined)
        .then(() => {
          entry.localLoadedAt = performance.now() - this.startedAt;
          connect();
          this.notify();
        }),
    };
    this.entries.set(name, entry);
    this.notify();
    return entry;
  }

  /**
   * Gets a document back in step after the server refused an update to it (#18). The server
   * applied none of the update and closed this document's connection; the rest of the socket is
   * untouched. A Yjs update can't be taken back, so the local copy, in memory and in IndexedDB,
   * is thrown away and the document is opened again from the server's state. Nothing refused is
   * left anywhere to be sent again, on this connection or the next. Changes made here that the
   * server hadn't acknowledged yet go with it: unlike losing access (#21), the person still has
   * the page and was never allowed to make them, so they are not offered back.
   */
  private async recover(entry: DocEntry): Promise<void> {
    this.discarded.add(entry);
    await entry.local.destroy(); // stop writing to IndexedDB, and close it so it can be deleted
    entry.provider?.destroy();
    entry.doc.destroy();
    await clearDocument(this.storeName(entry.name));
    this.entries.delete(entry.name);
    this.setUnsynced(entry.name, false);
    this.open(entry.name).generation = entry.generation + 1;
    for (const l of this.resetListeners) l(entry.name);
    this.notify();
  }

  /** Calls `listener` with a document's name each time it is replaced by a fresh copy. */
  onReset(listener: (name: string) => void): () => void {
    this.resetListeners.add(listener);
    return () => this.resetListeners.delete(listener);
  }

  /** Names of the documents this person already has in IndexedDB on this device. */
  async storedNames(): Promise<string[]> {
    const prefix = this.storeName("");
    const dbs = (await indexedDB.databases?.()) ?? [];
    return dbs.flatMap((db) =>
      db.name?.startsWith(prefix) ? [db.name.slice(prefix.length)] : [],
    );
  }

  /** Calls `listener` for each document this device loses access to, once it is deleted. */
  onLost(listener: (lost: LostDocument) => void): () => void {
    this.lostListeners.add(listener);
    return () => this.lostListeners.delete(listener);
  }

  /**
   * Deletes a document this person lost access to, from memory and from IndexedDB (#21). The
   * server decided: it closed the document with "access-revoked" while connected, or refused it
   * with "no-access" when the device (re)connected, which is how a device that was offline, or
   * reopened a page from IndexedDB that has since left its index, finds out. If the device held
   * edits the server never acknowledged, its last copy is handed to the listeners first.
   */
  private async lose(entry: DocEntry): Promise<void> {
    if (this.entries.get(entry.name) !== entry) return;
    this.entries.delete(entry.name);
    this.notify();
    await entry.whenLocal; // the local copy may still be loading on a fresh start
    const unsynced = this.unsynced.has(entry.name)
      ? Y.encodeStateAsUpdate(entry.doc)
      : null;
    for (const l of this.lostListeners) l({ name: entry.name, unsynced });
    // Let the UI drop the page (and its editor) before the document goes.
    await new Promise((r) => setTimeout(r, 0));
    await this.discard(entry);
    this.setUnsynced(entry.name, false);
    this.notify();
  }

  private async discard(entry: DocEntry): Promise<void> {
    this.discarded.add(entry);
    entry.provider?.destroy();
    await entry.local.destroy(); // stop writing to IndexedDB, and close it so it can be deleted
    entry.doc.destroy();
    await clearDocument(this.storeName(entry.name));
  }

  /**
   * Deletes everything this person has on this device: every document, in memory and in
   * IndexedDB, and what is kept beside them. Used when switching person, and when the person was
   * removed from the workspace (#21). Unsynced edits go with it.
   */
  async wipe(): Promise<void> {
    this.socket.destroy();
    // The entries stay in the map, and nobody is notified: a render in the meantime must find
    // them rather than open (and so recreate in IndexedDB) a document being deleted. The caller
    // reloads the app afterwards.
    await Promise.all([...this.entries.values()].map((e) => this.discard(e)));
    await Promise.all(
      (await this.storedNames()).map((name) =>
        clearDocument(this.storeName(name)),
      ),
    );
    try {
      for (const key of Object.keys(localStorage))
        if (key.startsWith(this.storeName(""))) localStorage.removeItem(key);
    } catch {
      // Nothing kept there.
    }
  }

  /** Where this person's copy of a document lives in IndexedDB (and their other keys in localStorage). */
  storeName(name: string): string {
    return `notes-access:${this.personId}:${name}`;
  }

  private get unsyncedKey(): string {
    return this.storeName("~unsynced");
  }

  private setUnsynced(name: string, unsynced: boolean): void {
    if (this.unsynced.has(name) === unsynced) return;
    if (unsynced) this.unsynced.add(name);
    else this.unsynced.delete(name);
    writeJson(this.unsyncedKey, [...this.unsynced]);
  }

  get(name: string): DocEntry | undefined {
    return this.entries.get(name);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): SyncSnapshot => {
    if (this.snapshotCache) return this.snapshotCache;
    let localLoaded = 0;
    let synced = 0;
    let pendingChanges = 0;
    for (const e of this.entries.values()) {
      if (e.localLoadedAt !== undefined) localLoaded++;
      if (e.synced) synced++;
      pendingChanges += e.unsyncedChanges;
    }
    const total = this.entries.size;
    const now = performance.now() - this.startedAt;
    if (total > 1 && localLoaded === total) this.allLocalLoadedMs ??= now;
    if (total > 1 && synced === total) this.allSyncedMs ??= now;
    this.snapshotCache = {
      connection: this.connection,
      total,
      localLoaded,
      synced,
      pendingChanges,
      allLocalLoadedMs: this.allLocalLoadedMs,
      allSyncedMs: this.allSyncedMs,
    };
    return this.snapshotCache;
  };

  /** Restart timing measurements, e.g. after creating a batch of test docs. */
  resetTimings(): void {
    this.allLocalLoadedMs = undefined;
    this.allSyncedMs = undefined;
    this.notify();
  }

  /**
   * Batch notifications so syncing hundreds of docs doesn't cause hundreds of renders: at once
   * after a quiet spell, at most every `NOTIFY_INTERVAL_MS` during a burst. Each one recounts
   * every document (`getSnapshot`), and documents load and sync one task at a time, so batching
   * per microtask alone cost O(n²) at startup (#22, as `LocalPages` did).
   */
  private notify(): void {
    this.snapshotCache = null;
    if (this.notifyScheduled) return;
    this.notifyScheduled = true;
    const run = () => {
      this.notifyScheduled = false;
      this.notifiedAt = performance.now();
      for (const l of this.listeners) l();
    };
    const wait = this.notifiedAt + NOTIFY_INTERVAL_MS - performance.now();
    if (wait <= 0) queueMicrotask(run);
    else setTimeout(run, wait);
  }
}

/**
 * localStorage helpers: storage may be unavailable, and then nothing is kept. A stored value
 * `parse` rejects (by throwing) reads as nothing too.
 */
export function readJson<T>(
  key: string,
  parse: (value: unknown) => T,
): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? parse(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function parseStringList(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("expected a list");
  return value.filter((item): item is string => typeof item === "string");
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not kept across reloads.
  }
}
