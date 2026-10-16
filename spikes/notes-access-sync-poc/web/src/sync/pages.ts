import {
  accessMap, indexDocName, indexMap, metaMap, pageDocName, parseDocName, readIndexLevels, readMeta,
  type AccessLevel, type PageDocs, type PageMeta,
} from "@homelab/notes-access-sync-poc-model";
import type * as Y from "yjs";
import type { DocEntry, SyncManager } from "./SyncManager";

/**
 * The page documents on this device, and their metadata: everything the sidebar is built from.
 *
 * It keeps a full local copy of every page the person can open: it follows the person's page
 * index (written by the server) and opens, and so persists and syncs, every page listed there.
 * It also opens every page document already in IndexedDB, so a page created here offline (which
 * the server hasn't indexed yet) is still there after a reload. Opening one asks the server
 * afresh, so a stored page this person can no longer open is refused and deleted (#21).
 *
 * Losing access (#21): when the sync manager deletes a page this person lost, it leaves the tree
 * here too. When the index itself is lost, the person is no longer in the workspace.
 */
export class LocalPages implements PageDocs {
  readonly index: DocEntry;
  private readonly metas = new Map<string, PageMeta>();
  private readonly watched = new Set<string>();
  /** Pages the index has listed since the app started: one missing from it now was lost. */
  private readonly indexed = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private snapshot: PageMeta[] = [];
  private levels: ReadonlyMap<string, AccessLevel> = new Map();
  private notifyScheduled = false;

  constructor(
    private readonly manager: SyncManager,
    personId: string,
    private readonly events: {
      /** A page lost while this device held edits the server never got (its last copy). */
      onLostEdits: (pageId: string, unsynced: Uint8Array) => void;
      /** The person's own index was refused: they were removed from the workspace. */
      onRemoved: () => void;
    },
  ) {
    this.index = manager.open(indexDocName(personId));
  }

  /** Starts following the index and opening stored pages. Returns a function that stops. */
  start(): () => void {
    const ids = indexMap(this.index.doc);
    const follow = () => {
      ids.forEach((_, id) => (this.indexed.add(id), this.watch(id)));
      this.levels = readIndexLevels(this.index.doc);
      this.changed();
    };
    follow();
    ids.observe(follow);
    void this.manager.storedNames().then((names) => {
      for (const name of names) {
        const ref = parseDocName(name);
        if (ref?.kind === "page") this.watch(ref.id);
      }
    });
    const offLost = this.manager.onLost(({ name, unsynced }) => {
      if (name === this.index.name) return this.events.onRemoved();
      const ref = parseDocName(name);
      if (ref?.kind !== "page") return;
      this.watched.delete(ref.id);
      this.metas.delete(ref.id);
      this.changed();
      if (unsynced) this.events.onLostEdits(ref.id, unsynced);
    });
    return () => {
      ids.unobserve(follow);
      offLost();
    };
  }

  get(id: string): Y.Doc | undefined {
    return this.manager.get(pageDocName(id))?.doc;
  }

  /** Opens the document for a page this device is creating. */
  create(id: string): Y.Doc {
    return this.watch(id).doc;
  }

  entry(id: string): DocEntry | undefined {
    return this.manager.get(pageDocName(id));
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** The metadata of every page document on this device whose metadata has arrived. */
  getSnapshot = (): PageMeta[] => this.snapshot;

  /** This person's level on each page, as the server last wrote it into their page index. */
  getLevels = (): ReadonlyMap<string, AccessLevel> => this.levels;

  /**
   * This person's level on a page. A page the index never listed is one this device created and
   * the server hasn't indexed yet: Full access. One the index listed and no longer does was lost,
   * and is about to be deleted: read-only until then.
   */
  levelOf(pageId: string): AccessLevel {
    return this.levels.get(pageId) ?? (this.indexed.has(pageId) ? "view" : "full");
  }

  private watch(id: string): DocEntry {
    const entry = this.manager.open(pageDocName(id));
    if (this.watched.has(id)) return entry;
    this.watched.add(id);

    const update = () => {
      const m = readMeta(id, entry.doc);
      if (m) this.metas.set(id, m);
      else this.metas.delete(id);
      this.changed();
    };
    // A page's metadata includes the access set on it (for the Share menu and the sidebar sections).
    metaMap(entry.doc).observe(update);
    accessMap(entry.doc).observe(update);
    update();
    return entry;
  }

  // Batched, so opening hundreds of pages doesn't rebuild the tree hundreds of times.
  private changed(): void {
    if (this.notifyScheduled) return;
    this.notifyScheduled = true;
    queueMicrotask(() => {
      this.notifyScheduled = false;
      this.snapshot = [...this.metas.values()];
      for (const l of this.listeners) l();
    });
  }
}
