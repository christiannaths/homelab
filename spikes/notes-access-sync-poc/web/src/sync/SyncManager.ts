import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";

export type ConnectionState = "connecting" | "connected" | "disconnected";

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
    const local = new IndexeddbPersistence(`notes-access:${this.personId}:${name}`, doc);
    const provider = new HocuspocusProvider({
      websocketProvider: this.socket,
      name,
      document: doc,
      token: this.personId,
      onSynced: () => {
        entry.synced = true;
        entry.syncedAt ??= performance.now() - this.startedAt;
        this.notify();
      },
      onUnsyncedChanges: ({ number }) => {
        entry.unsyncedChanges = number;
        this.notify();
      },
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
    const prefix = `notes-access:${this.personId}:`;
    const dbs = (await indexedDB.databases?.()) ?? [];
    return dbs.flatMap((db) => (db.name?.startsWith(prefix) ? [db.name.slice(prefix.length)] : []));
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
