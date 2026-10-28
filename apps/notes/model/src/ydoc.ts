import * as Y from "yjs";
import { parseDocName } from "./documents.ts";
import { isAccessLevel, type AccessLevel } from "./levels.ts";
import type { Page, PageAccess, PagePatch } from "./page.ts";
import type { DocumentChange } from "./review.ts";

// The Yjs side of the model (ADR-NOTE-008): only this module knows how Notes data sits in a
// Y.Doc. Maps hold one key per field or entry, so edits to different ones merge
// (ADR-NOTE-006 rule 4).

/** Any shared type in a document, as `transaction.changed` holds them. */
type SharedType =
  Y.Transaction["changed"] extends Map<infer T, unknown> ? T : never;

const meta = (doc: Y.Doc) => doc.getMap<unknown>("meta");
const access = (doc: Y.Doc) => doc.getMap<unknown>("access");

/** The page body, for BlockNote's collaboration extension. */
export const pageContent = (doc: Y.Doc): Y.XmlFragment =>
  doc.getXmlFragment("content");

const PERSON_KEY = "person:";
const WORKSPACE_KEY = "workspace";

function writeAccess(doc: Y.Doc, entries: Partial<PageAccess>): void {
  for (const [personId, level] of Object.entries(entries.people ?? {}))
    access(doc).set(PERSON_KEY + personId, level);
  if (entries.workspace !== undefined)
    access(doc).set(WORKSPACE_KEY, entries.workspace);
}

/**
 * Writes a new page's whole `meta` and `access` in one transaction, on the device creating it
 * only (ADR-NOTE-006 rule 2: never on read, or a device that hasn't synced yet would compete).
 */
export function writeNewPage(doc: Y.Doc, page: Page): void {
  doc.transact(() => {
    const m = meta(doc);
    m.set("workspaceId", page.workspaceId);
    m.set("title", page.title);
    m.set("kind", page.kind);
    m.set("parentId", page.parentId);
    m.set("section", page.section);
    m.set("order", page.order);
    m.set("createdAt", page.createdAt);
    if (page.deletedAt !== null) m.set("deletedAt", page.deletedAt);
    writeAccess(doc, page.access);
  });
}

/** Writes `patch` (from `restorePatch`, `trashPatch`, …) in one transaction. */
export function applyPagePatch(doc: Y.Doc, patch: PagePatch): void {
  doc.transact(() => {
    const m = meta(doc);
    if (patch.title !== undefined) m.set("title", patch.title);
    if (patch.parentId !== undefined) m.set("parentId", patch.parentId);
    if (patch.order !== undefined) m.set("order", patch.order);
    if (patch.deletedAt === null) m.delete("deletedAt");
    else if (patch.deletedAt !== undefined) m.set("deletedAt", patch.deletedAt);
    if (patch.access) writeAccess(doc, patch.access);
  });
}

const string = (value: unknown, fallback: string) =>
  typeof value === "string" ? value : fallback;
const number = (value: unknown) => (typeof value === "number" ? value : null);

function readAccess(doc: Y.Doc): PageAccess {
  const people: Record<string, AccessLevel> = {};
  let workspace: AccessLevel | undefined;
  for (const [key, value] of access(doc)) {
    if (!isAccessLevel(value)) continue;
    if (key === WORKSPACE_KEY) workspace = value;
    else if (key.startsWith(PERSON_KEY))
      people[key.slice(PERSON_KEY.length)] = value;
  }
  return workspace === undefined ? { people } : { people, workspace };
}

/**
 * Page `id` from its document, or null until its `meta` has arrived (a document opened before its
 * first sync). Values of the wrong type read as their defaults, and unknown access entries are
 * ignored, so a faulty client can't break a reader.
 */
export function readPage(id: string, doc: Y.Doc): Page | null {
  const m = meta(doc);
  const createdAt = number(m.get("createdAt"));
  if (createdAt === null) return null;
  const parentId = m.get("parentId");
  return {
    id,
    workspaceId: string(m.get("workspaceId"), ""),
    title: string(m.get("title"), ""),
    kind: "page",
    parentId: typeof parentId === "string" ? parentId : null,
    section: string(m.get("section"), ""),
    order: string(m.get("order"), ""),
    createdAt,
    deletedAt: number(m.get("deletedAt")),
    access: readAccess(doc),
  };
}

/**
 * What `update` would do to `doc` (the server's copy of `documentName`), for `reviewUpdate`. It is
 * applied to a scratch copy, so `doc` is untouched: Yjs updates can't be undone (ADR-NOTE-010).
 * An update `doc` already has touches nothing.
 */
export function previewUpdate(
  documentName: string,
  doc: Y.Doc,
  update: Uint8Array,
): DocumentChange {
  const copy = new Y.Doc();
  try {
    Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
    const changed: SharedType[] = [];
    copy.on("afterTransaction", (transaction: Y.Transaction) => {
      changed.push(...transaction.changed.keys());
    });
    Y.applyUpdate(copy, update);
    // A change nested anywhere below a top-level type (a block in `content`) counts as touching it.
    const touched = new Set<string>();
    for (const [name, root] of copy.share)
      if (changed.some((t) => t === root || Y.isParentOf(root, t._item)))
        touched.add(name);
    const ref = parseDocName(documentName);
    return ref?.kind === "page"
      ? { touched, after: readPage(ref.id, copy) }
      : { touched };
  } finally {
    copy.destroy();
  }
}

/** What a person's index lists: the pages they can open, with their level, and their workspaces. */
export interface Index {
  pages: ReadonlyMap<string, AccessLevel>;
  workspaces: ReadonlySet<string>;
}

const indexPages = (doc: Y.Doc) => doc.getMap<unknown>("pages");
const indexWorkspaces = (doc: Y.Doc) => doc.getMap<unknown>("workspaces");

/**
 * Devices read their level from here and never work it out (ADR-NOTE-013): it depends on
 * ancestors they may not hold. A value that isn't a level reads as Can view, the safe side.
 */
export function readIndex(doc: Y.Doc): Index {
  const pages = new Map<string, AccessLevel>();
  for (const [id, level] of indexPages(doc))
    pages.set(id, isAccessLevel(level) ? level : "view");
  return { pages, workspaces: new Set(indexWorkspaces(doc).keys()) };
}

/** Makes the index list exactly `index`, touching only the entries that change. Server only. */
export function writeIndex(doc: Y.Doc, index: Index): void {
  doc.transact(() => {
    const pages = indexPages(doc);
    for (const id of pages.keys()) if (!index.pages.has(id)) pages.delete(id);
    for (const [id, level] of index.pages)
      if (pages.get(id) !== level) pages.set(id, level);
    const workspaces = indexWorkspaces(doc);
    for (const id of workspaces.keys())
      if (!index.workspaces.has(id)) workspaces.delete(id);
    for (const id of index.workspaces)
      if (!workspaces.has(id)) workspaces.set(id, true);
  });
}

const workspaceMap = (doc: Y.Doc) => doc.getMap<unknown>("workspace");

/** The workspace's name, or null until it has arrived. */
export function readWorkspaceName(doc: Y.Doc): string | null {
  const name = workspaceMap(doc).get("name");
  return typeof name === "string" ? name : null;
}

export function setWorkspaceName(doc: Y.Doc, name: string): void {
  workspaceMap(doc).set("name", name);
}
