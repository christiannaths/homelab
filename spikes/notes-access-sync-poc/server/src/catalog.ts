import {
  pageLevels, readMeta, visiblePageIds,
  type AccessLevel, type PageMeta, type Person, type Workspace,
} from "@homelab/notes-access-sync-poc-model";
import * as Y from "yjs";

/**
 * The server's view of every page: each page document's metadata, kept in memory so access can be
 * checked when a document is opened, before it is loaded. It is derived from the page documents
 * (loaded from storage at startup, then updated on every change), never synced to anyone.
 */
export class PageCatalog {
  private readonly pages = new Map<string, PageMeta>();
  private people: readonly Person[];
  private workspaceCache: Workspace | null = null;
  private levelsCache = new Map<string, Map<string, AccessLevel>>();
  /** The page index each person was last given, so only changed indexes are rewritten. */
  private readonly indexes = new Map<string, Set<string>>();

  constructor(people: readonly Person[]) {
    this.people = people;
  }

  /** Reads a stored page document's metadata (at startup). */
  loadStored(id: string, state: Uint8Array): void {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, state);
    const meta = readMeta(id, doc);
    if (meta) this.pages.set(id, meta);
    doc.destroy();
  }

  /**
   * Records a page document's latest metadata. Returns true if the change can affect who may open
   * which page (a new page, or a new parent or section), so the page indexes need refreshing.
   */
  update(id: string, doc: Y.Doc): boolean {
    const meta = readMeta(id, doc);
    if (!meta) return false;
    const before = this.pages.get(id);
    this.pages.set(id, meta);
    this.workspaceCache = null;
    const structural = !before || before.parentId !== meta.parentId || before.section !== meta.section;
    if (structural) this.levelsCache.clear();
    return structural;
  }

  setPeople(people: readonly Person[]): void {
    this.people = people;
    this.workspaceCache = null;
    this.levelsCache.clear();
  }

  workspace(): Workspace {
    return (this.workspaceCache ??= { people: this.people, pages: [...this.pages.values()] });
  }

  /** `personId`'s level on each page they can open, cached until the tree or the people change. */
  levels(personId: string): Map<string, AccessLevel> {
    let levels = this.levelsCache.get(personId);
    if (!levels) {
      levels = pageLevels(this.workspace(), personId);
      this.levelsCache.set(personId, levels);
    }
    return levels;
  }

  /** The people whose page index no longer matches what they can open, with what it should list. */
  staleIndexes(): { personId: string; ids: Set<string> }[] {
    const out: { personId: string; ids: Set<string> }[] = [];
    for (const person of this.people) {
      const ids = visiblePageIds(this.workspace(), person.id);
      const written = this.indexes.get(person.id);
      if (written && written.size === ids.size && [...ids].every((id) => written.has(id))) continue;
      out.push({ personId: person.id, ids });
    }
    return out;
  }

  /** Marks `personId`'s page index as written with `ids`. */
  indexWritten(personId: string, ids: Set<string>): void {
    this.indexes.set(personId, ids);
  }
}
