import {
  indexDocName,
  pageLevels,
  type Catalog as ModelCatalog,
  type Index,
  type Page,
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

  constructor(memberships: Iterable<Membership>) {
    for (const membership of memberships) this.add(membership);
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

  /** What `personId`'s index should list now. */
  index(personId: string): Index {
    const workspaces = new Set<string>();
    for (const [workspaceId, members] of this.members)
      if (members.has(personId)) workspaces.add(workspaceId);
    return { pages: pageLevels(this, personId), workspaces };
  }

  /** The people whose index lists something other than it should, with what it should list. */
  staleIndexes(): { name: string; personId: string; index: Index }[] {
    const people = new Set(
      [...this.members.values()].flatMap((members) => [...members]),
    );
    return [...people].flatMap((personId) => {
      const index = this.index(personId);
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

const sameIndex = (a: Index, b: Index): boolean =>
  a.workspaces.size === b.workspaces.size &&
  [...a.workspaces].every((id) => b.workspaces.has(id)) &&
  a.pages.size === b.pages.size &&
  [...a.pages].every(([id, level]) => b.pages.get(id) === level);
