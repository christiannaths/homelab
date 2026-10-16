import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
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
  provider: HocuspocusProvider;
  local: IndexeddbPersistence;
  /** Resolves once the local IndexedDB copy has been applied, with no network needed. */
  whenLocal: Promise<void>;
  localLoadedAt?: number;
  syncedAt?: number;
  synced: boolean;
  unsyncedChanges: number;
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
export class SyncManager {
  readonly socket: HocuspocusProviderWebsocket;
  readonly startedAt = performance.now();
  private entries = new Map<string, DocEntry>();
  private listeners = new Set<() => void>();
  private lostListeners = new Set<(lost: LostDocument) => void>();
  /**
   * Documents holding local edits the server hasn't acknowledged yet, kept in localStorage so it
   * survives a reload while offline. The provider's own counter starts at zero on every load.
   */
  private readonly unsynced: Set<string>;
  private connection: ConnectionState = "connecting";
  private snapshotCache: SyncSnapshot | null = null;
  private notifyScheduled = false;
  private allLocalLoadedMs?: number;
  private allSyncedMs?: number;

  /**
   * `personId` is the connection token (identity is faked) and also prefixes this device's
   * IndexedDB stores, so each person's local copy is kept apart.
   */
  constructor(url: string, private personId: string) {
    this.unsynced = new Set(readJson<string[]>(this.unsyncedKey) ?? []);
    this.socket = new HocuspocusProviderWebsocket({
      url,
      // Keep retrying forever: offline is a normal state, not an error.
      maxAttempts: 0,
      maxDelay: 10_000,
      onStatus: ({ status }) => {
        this.connection = status as ConnectionState;
        // Whatever was synced before is unconfirmed until each doc re-syncs after
        // reconnecting (the provider emits onSynced again). Without this, the badge
        // would say "Synced" right after reconnecting, before anything was exchanged.
        if (status !== "connected") for (const e of this.entries.values()) e.synced = false;
        this.notify();
      },
    });
    // React to the OS's network state right away. Otherwise a dead socket is only
    // noticed after the provider's message timeout (~30s).
    addEventListener("offline", () => this.socket.disconnect());
    addEventListener("online", () => this.socket.connect());
  }

  open(name: string): DocEntry {
    const existing = this.entries.get(name);
    if (existing) return existing;

    const doc = new Y.Doc();
    const local = new IndexeddbPersistence(this.storeName(name), doc);
    const provider = new HocuspocusProvider({
      websocketProvider: this.socket,
      name,
      document: doc,
      token: this.personId,
      // Each provider gets its own address on the socket, so a document deleted after losing
      // access can be opened again right away when access comes back (explore.md §3).
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
      // Losing access (#21): revoked while connected, or refused when (re)connecting.
      onClose: ({ event }) => {
        if (event.reason === "access-revoked") void this.lose(entry);
      },
      onAuthenticationFailed: ({ reason }) => {
        if (reason === "no-access") void this.lose(entry);
      },
    });
    // Edits made on this device (not ones arriving from the server or loaded from IndexedDB).
    doc.on("update", (_update: Uint8Array, origin: unknown) => {
      if (origin !== provider && origin !== local) this.setUnsynced(name, true);
    });

    const entry: DocEntry = {
      name,
      doc,
      provider,
      local,
      synced: false,
      unsyncedChanges: 0,
      whenLocal: local.whenSynced.then(() => {
        entry.localLoadedAt = performance.now() - this.startedAt;
        this.notify();
      }),
    };
    this.entries.set(name, entry);
    // Since v2, providers on a shared socket must be attached explicitly.
    provider.attach();
    this.notify();
    return entry;
  }

  /** Names of the documents this person already has in IndexedDB on this device. */
  async storedNames(): Promise<string[]> {
    const prefix = this.storeName("");
    const dbs = (await indexedDB.databases?.()) ?? [];
    return dbs.flatMap((db) => (db.name?.startsWith(prefix) ? [db.name.slice(prefix.length)] : []));
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
    const unsynced = this.unsynced.has(entry.name) ? Y.encodeStateAsUpdate(entry.doc) : null;
    for (const l of this.lostListeners) l({ name: entry.name, unsynced });
    // Let the UI drop the page (and its editor) before the document goes.
    await new Promise((r) => setTimeout(r, 0));
    await this.discard(entry);
    this.setUnsynced(entry.name, false);
    this.notify();
  }

  private async discard(entry: DocEntry): Promise<void> {
    entry.provider.destroy();
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
    const entries = [...this.entries.values()];
    this.entries.clear();
    await Promise.all(entries.map((e) => this.discard(e)));
    await Promise.all((await this.storedNames()).map((name) => clearDocument(this.storeName(name))));
    try {
      for (const key of Object.keys(localStorage)) if (key.startsWith(this.storeName(""))) localStorage.removeItem(key);
    } catch {
      // Nothing kept there.
    }
    this.notify();
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

  // Batch notifications so syncing hundreds of docs doesn't cause hundreds of renders.
  private notify(): void {
    this.snapshotCache = null;
    if (this.notifyScheduled) return;
    this.notifyScheduled = true;
    queueMicrotask(() => {
      this.notifyScheduled = false;
      for (const l of this.listeners) l();
    });
  }
}

/** localStorage helpers: storage may be unavailable, and then nothing is kept. */
export function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not kept across reloads.
  }
}
