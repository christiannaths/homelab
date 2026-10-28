import {
  applyPagePatch,
  buildTree,
  indexDocName,
  newPage,
  observePage,
  pageDocName,
  parseDocName,
  readIndex,
  readPage,
  readWorkspaceName,
  restorePatch,
  trashPatch,
  workspaceDocName,
  writeNewPage,
  type AccessLevel,
  type Page,
  type PagePatch,
} from "@homelab/notes-model";
import type * as Y from "yjs";
import { DocumentSync } from "./document-sync.ts";

export interface Workspace {
  id: string;
  /** Null until the workspace document has arrived on this device. */
  name: string | null;
}

export interface NotebookSnapshot {
  /** The workspaces the person belongs to, by name. */
  workspaces: readonly Workspace[];
  /** Every page on this device whose `meta` has arrived, in any workspace, trashed ones too. */
  pages: readonly Page[];
  /** The person's level on each page their index lists, as the server last wrote it. */
  levels: ReadonlyMap<string, AccessLevel>;
  /** Whether the index has synced since Notes opened, so it lists what the person can open now. */
  indexSynced: boolean;
}

/**
 * The most often the snapshot is rebuilt while documents keep arriving: at startup they load from
 * IndexedDB one task at a time, and rebuilding the sidebar for each made the access spike's warm
 * start quadratic (ADR-NOTE-010).
 */
const PUBLISH_INTERVAL_MS = 100;

/**
 * What one person has on this device, kept in step with their index (ADR-NOTE-010): it opens
 * every document the index lists and deletes the ones it stops listing. It also opens every page
 * stored here, so one made offline, which the server hasn't indexed yet, is still there after a
 * reload (ADR-NOTE-001); one the person can no longer open is refused, and deleted.
 */
export class Notebook {
  readonly #sync: DocumentSync;
  readonly #personId: string;
  readonly #index: string;
  readonly #listeners = new Set<() => void>();
  /** Documents whose changes are followed already. */
  readonly #watched = new WeakSet<Y.Doc>();
  /** The documents the index listed and that weren't forgotten since: the ones to forget once it stops. */
  #listed = new Set<string>();
  /** Every page document opened, for whatever reason. */
  readonly #pages = new Set<string>();
  #snapshot: NotebookSnapshot = {
    workspaces: [],
    pages: [],
    levels: new Map(),
    indexSynced: false,
  };
  #publishScheduled = false;
  #publishedAt = -Infinity;

  constructor(sync: DocumentSync, personId: string) {
    this.#sync = sync;
    this.#personId = personId;
    this.#index = indexDocName(personId);
    sync.onStateChange((name) => {
      if (name === this.#index) return this.#follow();
      // A document the server refused an update to comes back as a fresh copy. One the person
      // lost stays closed until the index changes, rather than being refused again and again.
      const doc = sync.get(name);
      if (doc) this.#watch(name, doc);
      this.#changed();
    });
    this.#follow();
    void sync.storedNames().then((names) => {
      for (const name of names)
        if (parseDocName(name)?.kind === "page") this.#open(name);
    });
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  getSnapshot = (): NotebookSnapshot => this.#snapshot;

  /** Adds a page at the end of `parentId`'s subpages, or of the Private section; returns its id. */
  addPage(workspaceId: string, parentId: string | null = null): string {
    const id = crypto.randomUUID();
    const page = newPage(buildTree(this.#snapshot.pages, workspaceId), {
      id,
      workspaceId,
      parentId,
      creatorId: this.#personId,
      now: Date.now(),
    });
    // Written at once: the local copy loads into the same document and the server reviews the
    // whole page when the provider starts.
    writeNewPage(this.#open(pageDocName(id)), page);
    return id;
  }

  /** Writes `patch` to page `id`, if this device has it. */
  updatePage(id: string, patch: PagePatch): void {
    const doc = this.#sync.get(pageDocName(id));
    if (doc) applyPagePatch(doc, patch);
  }

  /** Moves page `id` to the Trash, with its subpages. */
  trashPage(id: string): void {
    this.updatePage(id, trashPatch(Date.now()));
  }

  /** Restores page `id` from the Trash, with its subpages; see `restorePatch` for where to. */
  restorePage(id: string): void {
    const patch = restorePatch(this.#snapshot.pages, id);
    if (patch) this.updatePage(id, patch);
  }

  /** Page `id`'s document, for its editor, once its local copy has loaded. */
  loadedPage(id: string): Y.Doc | undefined {
    const name = pageDocName(id);
    return this.#sync.isLoaded(name) ? this.#sync.get(name) : undefined;
  }

  /** Who else has page `id` open, for collaborators' cursors. */
  awareness(id: string) {
    return this.#sync.awareness(pageDocName(id));
  }

  /** Opens what the index lists, and once it has synced, forgets what it no longer lists. */
  #follow(): void {
    const index = this.#sync.open(this.#index);
    if (!this.#watched.has(index)) {
      this.#watched.add(index);
      index.on("update", () => this.#follow());
    }
    const { pages, workspaces } = readIndex(index);
    const listed = new Set([
      ...[...workspaces].map(workspaceDocName),
      ...[...pages.keys()].map(pageDocName),
    ]);
    for (const name of listed) this.#open(name);
    // Until it has synced since opening, the index may be an empty or out-of-date local copy.
    if (this.#sync.hasSynced(this.#index)) {
      for (const name of this.#listed)
        if (!listed.has(name)) void this.#forget(name);
      this.#listed = listed;
    } else for (const name of listed) this.#listed.add(name);
    this.#changed();
  }

  #open(name: string): Y.Doc {
    const doc = this.#sync.open(name);
    if (parseDocName(name)?.kind === "page") this.#pages.add(name);
    this.#watch(name, doc);
    return doc;
  }

  #forget(name: string): Promise<void> {
    this.#pages.delete(name);
    return this.#sync.forget(name);
  }

  #watch(name: string, doc: Y.Doc): void {
    if (this.#watched.has(doc)) return;
    this.#watched.add(doc);
    const onChange = () => this.#changed();
    // Body edits don't change the snapshot, so typing doesn't rebuild the sidebar.
    if (parseDocName(name)?.kind === "page") observePage(doc, onChange);
    else doc.on("update", onChange);
  }

  /**
   * Publishes a new snapshot: at once (next microtask) after a quiet spell, but during a burst at
   * most every `PUBLISH_INTERVAL_MS`.
   */
  #changed(): void {
    if (this.#publishScheduled) return;
    this.#publishScheduled = true;
    const publish = () => {
      this.#publishScheduled = false;
      this.#publishedAt = performance.now();
      this.#snapshot = this.#read();
      for (const listener of this.#listeners) listener();
    };
    const wait = this.#publishedAt + PUBLISH_INTERVAL_MS - performance.now();
    if (wait <= 0) queueMicrotask(publish);
    else setTimeout(publish, wait);
  }

  #read(): NotebookSnapshot {
    const index = this.#sync.get(this.#index);
    const { pages: levels, workspaces: ids } = index
      ? readIndex(index)
      : { pages: new Map<string, AccessLevel>(), workspaces: [] };
    const workspaces = [...ids]
      .map((id) => ({ id, name: nameOf(this.#sync.get(workspaceDocName(id))) }))
      .toSorted(
        (a, b) =>
          (a.name ?? "").localeCompare(b.name ?? "") ||
          a.id.localeCompare(b.id),
      );
    const pages: Page[] = [];
    for (const name of this.#pages) {
      const ref = parseDocName(name);
      const doc = this.#sync.get(name);
      const page = ref?.kind === "page" && doc ? readPage(ref.id, doc) : null;
      if (page) pages.push(page);
    }
    return {
      workspaces,
      pages,
      levels,
      indexSynced: this.#sync.hasSynced(this.#index),
    };
  }
}

const opened = new Map<string, Notebook>();

/**
 * `personId`'s notebook on this device, syncing over `/sync`; opened on first use and kept for
 * the life of the page.
 */
export function notebookFor(personId: string): Notebook {
  let notebook = opened.get(personId);
  if (!notebook) {
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const url = `${scheme}://${location.host}/sync`;
    notebook = new Notebook(new DocumentSync(url, personId), personId);
    opened.set(personId, notebook);
  }
  return notebook;
}

const nameOf = (workspace: Y.Doc | undefined): string | null =>
  workspace ? readWorkspaceName(workspace) : null;
