import { randomUUID } from "node:crypto";
import type { Connection, Hocuspocus } from "@hocuspocus/server";
import type * as Y from "yjs";
import {
  buildTree,
  canEdit,
  documentLevel,
  newPage,
  pageDocName,
  readPage,
  setWorkspaceName,
  workspaceDocName,
  writeIndex,
  writeNewPage,
  type Page,
} from "@homelab/notes-model";
import { Catalog } from "./catalog.ts";
import type { Person } from "./people.ts";
import type { Workspaces } from "./workspaces.ts";

/** Who is on the other end of a sync socket. Read once, when the socket opens. */
export interface SyncContext {
  person: Person;
}

/**
 * Every person's workspaces and the documents the server writes for them: workspace documents
 * when a workspace is made, and indexes (ADR-NOTE-010, ADR-NOTE-013).
 */
export class Notebooks {
  readonly catalog: Catalog;
  readonly #workspaces: Workspaces;
  readonly #hocuspocus: Hocuspocus<SyncContext>;
  /** Server writes to documents, one at a time, in order. */
  #writes: Promise<void> = Promise.resolve();

  constructor(
    workspaces: Workspaces,
    pages: Iterable<Page>,
    hocuspocus: Hocuspocus<SyncContext>,
  ) {
    this.#workspaces = workspaces;
    this.#hocuspocus = hocuspocus;
    this.catalog = new Catalog(workspaces.memberships(), pages);
  }

  /**
   * Gives a person who belongs to no workspace a default one, which they own, with an empty page
   * in their Private section to land on (spec #130), and resolves once it and their index are
   * written. The server writes that page, not the device: two devices opening Notes for the
   * first time at once would each make one.
   */
  async admit(person: Person): Promise<void> {
    // Checked and recorded before the first await, so two requests at once make one workspace.
    if (!this.catalog.hasWorkspace(person.id)) {
      const membership = this.#workspaces.create(person.id);
      const { workspaceId } = membership;
      this.catalog.add(membership);
      const name = person.name ? `${person.name}'s workspace` : "My workspace";
      void this.#write(workspaceDocName(workspaceId), (doc) =>
        setWorkspaceName(doc, name),
      );
      const page = newPage(buildTree([], workspaceId), {
        id: randomUUID(),
        workspaceId,
        parentId: null,
        creatorId: person.id,
        now: Date.now(),
      });
      this.catalog.setPage(page);
      void this.#write(pageDocName(page.id), (doc) => writeNewPage(doc, page));
    }
    await this.refreshIndexes();
  }

  /**
   * Keeps the catalog in step with page `id`'s document after a change was applied, and the
   * indexes with it.
   */
  pageChanged(id: string, doc: Y.Doc): void {
    const page = readPage(id, doc);
    if (page && this.catalog.setPage(page)) void this.refreshIndexes();
  }

  /** Rewrites the index of everyone whose index lists the wrong things. */
  refreshIndexes(): Promise<void> {
    return this.#queue(async () => {
      for (const { name, personId, index } of this.catalog.staleIndexes()) {
        await this.#writeNow(name, (doc) => writeIndex(doc, index));
        this.catalog.indexWritten(personId, index);
        this.#recheckConnections(personId);
      }
    });
  }

  /** Resolves once every write queued so far is done. */
  settled(): Promise<void> {
    return this.#queue(async () => {});
  }

  #write(name: string, change: (doc: Y.Doc) => void): Promise<void> {
    return this.#queue(() => this.#writeNow(name, change));
  }

  #queue(write: () => Promise<void>): Promise<void> {
    const done = this.#writes.then(write);
    this.#writes = done.catch((error: unknown) =>
      console.error("A server write to a document failed:", error),
    );
    return done;
  }

  async #writeNow(name: string, change: (doc: Y.Doc) => void): Promise<void> {
    const connection = await this.#hocuspocus.openDirectConnection(name);
    await connection.transact(change);
    // ADR-NOTE-010: unloading at once races with a device opening the document in the same
    // moment, which Hocuspocus 4.7.1 then attaches to the copy it is destroying.
    await connection.disconnect({ unloadImmediately: false });
  }

  /**
   * Brings `personId`'s open documents in line with what they may open now (ADR-NOTE-010): one
   * they lost is closed with `access-revoked`, and the rest become read-only or writable.
   */
  #recheckConnections(personId: string): void {
    for (const [name, document] of this.#hocuspocus.documents) {
      const level = documentLevel(this.catalog, personId, name);
      for (const connection of document.getConnections()) {
        if (personOf(connection) !== personId) continue;
        if (level === "none")
          connection.close({ code: 4403, reason: "access-revoked" });
        else connection.readOnly = !canEdit(level);
      }
    }
  }
}

/** The person a connection was opened for. Hocuspocus types a document's connections' context as `any`. */
function personOf(connection: Connection): string {
  const context: unknown = connection.context;
  const person =
    typeof context === "object" && context !== null && "person" in context
      ? context.person
      : undefined;
  const id =
    typeof person === "object" && person !== null && "id" in person
      ? person.id
      : undefined;
  if (typeof id !== "string") throw new Error("A connection has no person");
  return id;
}
