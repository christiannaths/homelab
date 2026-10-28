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
}

// The documents' names and shapes (ADR-NOTE-013), as the server writes them.
const indexName = (personId: string) => `index:${personId}`;
const workspaceName = (id: string) => `workspace:${id}`;
const listedWorkspaces = (index: Y.Doc) => [
  ...index.getMap("workspaces").keys(),
];
function nameOf(workspace: Y.Doc | undefined): string | null {
  const name = workspace?.getMap("meta").get("name");
  return typeof name === "string" ? name : null;
}

/**
 * What one person has on this device, kept in step with their index (ADR-NOTE-010): it opens
 * every document the index lists and deletes the ones it stops listing.
 */
export class Notebook {
  readonly #sync: DocumentSync;
  readonly #index: string;
  readonly #listeners = new Set<() => void>();
  /** Documents whose changes are followed already. */
  readonly #watched = new WeakSet<Y.Doc>();
  /** The workspace documents opened for the index, and not forgotten since. */
  #workspaces = new Set<string>();
  #snapshot: NotebookSnapshot = { workspaces: [] };

  constructor(sync: DocumentSync, personId: string) {
    this.#sync = sync;
    this.#index = indexName(personId);
    sync.onStateChange((name) => {
      if (name === this.#index) return this.#follow();
      // A document the server refused an update to comes back as a fresh copy. One the person
      // lost stays closed until the index changes, rather than being refused again and again.
      const doc = sync.get(name);
      if (doc) this.#watch(doc, () => this.#refresh());
      this.#refresh();
    });
    this.#follow();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  getSnapshot = (): NotebookSnapshot => this.#snapshot;

  /** Opens what the index lists, and once it has synced, forgets what it no longer lists. */
  #follow(): void {
    const index = this.#sync.open(this.#index);
    this.#watch(index, () => this.#follow());
    const listed = new Set(listedWorkspaces(index).map(workspaceName));
    for (const name of listed)
      this.#watch(this.#sync.open(name), () => this.#refresh());
    // Until it has synced since opening, the index may be an empty or out-of-date local copy.
    if (this.#sync.hasSynced(this.#index)) {
      for (const name of this.#workspaces)
        if (!listed.has(name)) void this.#sync.forget(name);
      this.#workspaces = listed;
    } else for (const name of listed) this.#workspaces.add(name);
    this.#refresh();
  }

  #watch(doc: Y.Doc, onChange: () => void): void {
    if (this.#watched.has(doc)) return;
    this.#watched.add(doc);
    doc.on("update", onChange);
  }

  #refresh(): void {
    const index = this.#sync.get(this.#index);
    const workspaces = (index ? listedWorkspaces(index) : [])
      .map((id) => ({ id, name: nameOf(this.#sync.get(workspaceName(id))) }))
      .toSorted(
        (a, b) =>
          (a.name ?? "").localeCompare(b.name ?? "") ||
          a.id.localeCompare(b.id),
      );
    this.#snapshot = { workspaces };
    for (const listener of this.#listeners) listener();
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
