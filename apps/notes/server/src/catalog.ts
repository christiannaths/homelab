import {
  indexName,
  parseDocumentName,
  sameIndex,
  type PersonIndex,
} from "./layout.ts";
import type { Membership, WorkspaceRole } from "./workspaces.ts";

/** How a person may open one document (ADR-NOTE-010). */
export type DocumentAccess = "none" | "read-only" | "read-write";

/**
 * The server's in-memory view of who belongs to which workspace (ADR-NOTE-010), built from
 * storage at startup and kept current as memberships change, so a document's access is known
 * before it is loaded. Indexes are written from it.
 */
export class Catalog {
  /** Each workspace's members, with their role. */
  readonly #members = new Map<string, Map<string, WorkspaceRole>>();
  /** The index each person was last given, so only changed indexes are rewritten. */
  readonly #written = new Map<string, PersonIndex>();

  constructor(memberships: Iterable<Membership>) {
    for (const membership of memberships) this.add(membership);
  }

  add({ workspaceId, personId, role }: Membership): void {
    let members = this.#members.get(workspaceId);
    if (!members) {
      members = new Map<string, WorkspaceRole>();
      this.#members.set(workspaceId, members);
    }
    members.set(personId, role);
  }

  /** Whether `personId` belongs to any workspace. */
  hasWorkspace(personId: string): boolean {
    return [...this.#members.values()].some((members) => members.has(personId));
  }

  /** What `personId`'s index should list now. */
  index(personId: string): PersonIndex {
    const workspaces = new Map<string, WorkspaceRole>();
    for (const [workspaceId, members] of this.#members) {
      const role = members.get(personId);
      if (role) workspaces.set(workspaceId, role);
    }
    return { workspaces };
  }

  access(personId: string, documentName: string): DocumentAccess {
    const ref = parseDocumentName(documentName);
    switch (ref?.kind) {
      case "index":
        // ADR-NOTE-013: only the server writes indexes.
        return ref.personId === personId ? "read-only" : "none";
      case "workspace":
        return this.#members.get(ref.workspaceId)?.has(personId)
          ? "read-write"
          : "none";
    }
    return "none";
  }

  /** The people whose index lists something other than it should, with what it should list. */
  staleIndexes(): { name: string; personId: string; index: PersonIndex }[] {
    const people = new Set(
      [...this.#members.values()].flatMap((members) => [...members.keys()]),
    );
    return [...people].flatMap((personId) => {
      const index = this.index(personId);
      const written = this.#written.get(personId);
      return written && sameIndex(written, index)
        ? []
        : [{ name: indexName(personId), personId, index }];
    });
  }

  indexWritten(personId: string, index: PersonIndex): void {
    this.#written.set(personId, index);
  }
}
