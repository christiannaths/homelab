import {
  indexDocName,
  pageLevels,
  resolveAccess,
  type Catalog as ModelCatalog,
  type Index,
  type Page,
  type PageAccess,
  type ResolvedAccess,
} from "@homelab/notes-model";
import type { Membership } from "./workspaces.ts";

/**
 * The server's in-memory view of every page and of who belongs to which workspace
 * (ADR-NOTE-010), built from storage at startup and kept current, so a document's access is known
 * before it is loaded. Indexes are written from it.
 */
export class Catalog implements ModelCatalog {
  readonly pages = new Map<string, Page>();
  /** Each workspace's members by workspace id. Their roles are in SQLite only. */
  readonly members = new Map<string, Set<string>>();
  /** The index each person was last given, so only changed indexes are rewritten. */
  readonly #written = new Map<string, Index>();

  constructor(memberships: Iterable<Membership>, pages: Iterable<Page>) {
    for (const membership of memberships) this.add(membership);
    for (const page of pages) this.pages.set(page.id, page);
  }

  /**
   * Records a page as its document now reads. Returns whether that can change anyone's level on
   * any page (a new page, a move, or a change to its access), so indexes need rewriting; a title
   * or Trash change can't.
   */
  setPage(page: Page): boolean {
    const before = this.pages.get(page.id);
    this.pages.set(page.id, page);
    return (
      !before ||
      before.workspaceId !== page.workspaceId ||
      before.parentId !== page.parentId ||
      before.section !== page.section ||
      !sameAccess(before.access, page.access)
    );
  }

  add({ workspaceId, personId }: Membership): void {
    let members = this.members.get(workspaceId);
    if (!members) {
      members = new Set();
      this.members.set(workspaceId, members);
    }
    members.add(personId);
  }

  /** Whether `personId` belongs to any workspace. */
  hasWorkspace(personId: string): boolean {
    return [...this.members.values()].some((members) => members.has(personId));
  }

  /** What `personId`'s index should list now; pass `resolved` when asking for many people. */
  index(
    personId: string,
    resolved: ReadonlyMap<string, ResolvedAccess> = resolveAccess(this.pages),
  ): Index {
    const workspaces = new Set<string>();
    for (const [workspaceId, members] of this.members)
      if (members.has(personId)) workspaces.add(workspaceId);
    return { pages: pageLevels(this, personId, resolved), workspaces };
  }

  /** The people whose index lists something other than it should, with what it should list. */
  staleIndexes(): { name: string; personId: string; index: Index }[] {
    const people = new Set(
      [...this.members.values()].flatMap((members) => [...members]),
    );
    const resolved = resolveAccess(this.pages);
    return [...people].flatMap((personId) => {
      const index = this.index(personId, resolved);
      const written = this.#written.get(personId);
      return written && sameIndex(written, index)
        ? []
        : [{ name: indexDocName(personId), personId, index }];
    });
  }

  indexWritten(personId: string, index: Index): void {
    this.#written.set(personId, index);
  }
}

function sameAccess(a: PageAccess, b: PageAccess): boolean {
  const people = (access: PageAccess) => Object.entries(access.people);
  return (
    a.workspace === b.workspace &&
    people(a).length === people(b).length &&
    people(a).every(([id, level]) => b.people[id] === level)
  );
}

const sameIndex = (a: Index, b: Index): boolean =>
  a.workspaces.size === b.workspaces.size &&
  [...a.workspaces].every((id) => b.workspaces.has(id)) &&
  a.pages.size === b.pages.size &&
  [...a.pages].every(([id, level]) => b.pages.get(id) === level);
