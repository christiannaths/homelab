import {
  pageLevels, readMeta, readTeamspace, visibleTeamspaces,
  type AccessLevel, type PageMeta, type Person, type Teamspace, type Workspace,
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
  private readonly indexes = new Map<string, ReadonlyMap<string, AccessLevel>>();
  /** Every teamspace, from its teamspace document (#17). */
  private readonly teamspaces = new Map<string, Teamspace>();
  /** The teamspaces each person's index was last given. */
  private readonly teamspaceIndexes = new Map<string, ReadonlyMap<string, AccessLevel>>();

  constructor(people: readonly Person[]) {
    this.people = people;
  }

  /** Reads a stored teamspace document (at startup). */
  loadStoredTeamspace(id: string, state: Uint8Array): void {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, state);
    const teamspace = readTeamspace(id, doc);
    if (teamspace) this.teamspaces.set(id, teamspace);
    doc.destroy();
  }

  /** The teamspace as the server holds it, or null if it doesn't exist yet. */
  teamspace(id: string): Teamspace | null {
    return this.teamspaces.get(id) ?? null;
  }

  /**
   * Records a teamspace document's latest state. Returns true if who may open what changed (its
   * kind, default levels or members), so the indexes need refreshing. A rename changes nothing.
   */
  updateTeamspace(id: string, doc: Y.Doc): boolean {
    const teamspace = readTeamspace(id, doc);
    if (!teamspace) return false;
    const before = this.teamspaces.get(id);
    this.teamspaces.set(id, teamspace);
    this.workspaceCache = null;
    const access = (t: Teamspace | undefined) => t && JSON.stringify({ ...t, name: "" });
    if (access(before) === access(teamspace)) return false;
    this.levelsCache.clear();
    return true;
  }

  /** The people whose index lists the wrong teamspaces, with the teamspaces it should list. */
  staleTeamspaceIndexes(): { personId: string; levels: Map<string, AccessLevel> }[] {
    const out: { personId: string; levels: Map<string, AccessLevel> }[] = [];
    for (const person of this.people) {
      const levels = visibleTeamspaces(this.workspace(), person.id);
      const written = this.teamspaceIndexes.get(person.id);
      if (written && written.size === levels.size && [...levels].every(([id, l]) => written.get(id) === l)) continue;
      out.push({ personId: person.id, levels });
    }
    return out;
  }

  teamspaceIndexWritten(personId: string, levels: ReadonlyMap<string, AccessLevel>): void {
    this.teamspaceIndexes.set(personId, levels);
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
   * which page at which level (a new page, a new parent or section, or a change to the access set
   * on it), so the page indexes need refreshing.
   */
  update(id: string, doc: Y.Doc): boolean {
    const meta = readMeta(id, doc);
    if (!meta) return false;
    const before = this.pages.get(id);
    this.pages.set(id, meta);
    this.workspaceCache = null;
    const structural =
      !before ||
      before.parentId !== meta.parentId ||
      before.section !== meta.section ||
      JSON.stringify(before.access) !== JSON.stringify(meta.access);
    if (structural) this.levelsCache.clear();
    return structural;
  }

  setPeople(people: readonly Person[]): void {
    this.people = people;
    this.workspaceCache = null;
    this.levelsCache.clear();
  }

  workspace(): Workspace {
    return (this.workspaceCache ??= {
      people: this.people,
      pages: [...this.pages.values()],
      teamspaces: [...this.teamspaces.values()],
    });
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
  staleIndexes(): { personId: string; levels: Map<string, AccessLevel> }[] {
    const out: { personId: string; levels: Map<string, AccessLevel> }[] = [];
    for (const person of this.people) {
      const levels = this.levels(person.id);
      const written = this.indexes.get(person.id);
      if (written && written.size === levels.size && [...levels].every(([id, l]) => written.get(id) === l)) continue;
      out.push({ personId: person.id, levels });
    }
    return out;
  }

  /** Marks `personId`'s page index as written with `levels`. */
  indexWritten(personId: string, levels: ReadonlyMap<string, AccessLevel>): void {
    this.indexes.set(personId, levels);
  }
}
