import * as Y from "yjs";
import { freshKeys, keyBetween, keysAreUsable } from "./order.ts";
import { isInSubtree, type PageKind, type PageMeta, type Tree, type TreeNode } from "./tree.ts";

/**
 * The document split (ticket #14, see the spike's ticket notes for the options weighed):
 * - `page:<id>`: one document per page holding **both** its metadata (the `meta` map: title,
 *   parent, section, order, kind, dates) and its content. Whoever receives a page receives its
 *   title and its place in the tree, and nothing about any other page. Each person's sidebar is
 *   derived from the page documents their device received.
 * - `index:<personId>`: one document per person, written only by the server, listing the ids of
 *   the pages that person can open (ids only, no titles). Devices follow it to know which page
 *   documents to open, as children name their parent but parents don't list their children.
 * There is no workspace-wide tree document any more.
 */
export const pageDocName = (id: string) => `page:${id}`;
export const indexDocName = (personId: string) => `index:${personId}`;

export type DocRef = { kind: "page"; id: string } | { kind: "index"; personId: string };

export function parseDocName(name: string): DocRef | null {
  const [, kind, rest] = name.match(/^(page|index):(.+)$/) ?? [];
  if (kind === "page") return { kind, id: rest };
  if (kind === "index") return { kind, personId: rest };
  return null;
}

/** A person's Private section. Teamspaces add `teamspace:<id>` later. */
export const privateSection = (personId: string) => `private:${personId}`;

export type SectionRef = { kind: "private"; personId: string };

export function parseSection(section: string): SectionRef | null {
  const [, personId] = section.match(/^private:(.+)$/) ?? [];
  return personId ? { kind: "private", personId } : null;
}

/** A page document's metadata: one key per field, so a rename and a move merge (ADR 7 rule 4). */
export const metaMap = (doc: Y.Doc) => doc.getMap<unknown>("meta");

/** A page index document's ids (id → true). */
export const indexMap = (doc: Y.Doc) => doc.getMap<boolean>("pages");

/**
 * The page's metadata, or null while it hasn't arrived yet (a document opened before its first
 * sync). Never creates anything: the creating device writes the whole map once (ADR 7 rule 2).
 */
export function readMeta(id: string, doc: Y.Doc): PageMeta | null {
  const m = metaMap(doc);
  if (!m.has("createdAt")) return null;
  return {
    id,
    title: (m.get("title") as string) ?? "",
    kind: (m.get("kind") as PageKind) ?? "page",
    parentId: (m.get("parentId") as string | null) ?? null,
    section: (m.get("section") as string) ?? "",
    order: (m.get("order") as string) ?? "",
    createdAt: (m.get("createdAt") as number) ?? 0,
    deletedAt: (m.get("deletedAt") as number | undefined) ?? undefined,
  };
}

/** The ids a page index lists. */
export function readIndex(doc: Y.Doc): string[] {
  return [...indexMap(doc).keys()];
}

/** Makes a page index list exactly `ids`, touching only the entries that change. Server only. */
export function writeIndex(doc: Y.Doc, ids: ReadonlySet<string>): void {
  const map = indexMap(doc);
  doc.transact(() => {
    for (const id of [...map.keys()]) if (!ids.has(id)) map.delete(id);
    for (const id of ids) if (!map.has(id)) map.set(id, true);
  });
}

/** The page documents a device holds, and a way to start one for a page it creates. */
export interface PageDocs {
  get(id: string): Y.Doc | undefined;
  create(id: string): Y.Doc;
}

function childrenOf(tree: Tree, parentId: string | null, section: string): TreeNode[] {
  if (parentId !== null) return tree.byId.get(parentId)?.children ?? [];
  return tree.roots.filter((n) => n.section === section && !n.parentHidden);
}

/**
 * A sort key for a position among `parentId`'s children (or the section's top-level pages),
 * ignoring `movingId`. If the siblings' keys are missing or tied, it renumbers them first.
 */
function keyForPosition(
  docs: PageDocs,
  tree: Tree,
  parentId: string | null,
  section: string,
  index: number,
  movingId?: string,
): string {
  const siblings = childrenOf(tree, parentId, section).filter((n) => n.page.id !== movingId);
  let keys = siblings.map((n) => n.page.order);
  if (!keysAreUsable(keys)) {
    keys = freshKeys(siblings.length);
    siblings.forEach((n, i) => {
      const doc = docs.get(n.page.id);
      if (doc) metaMap(doc).set("order", keys[i]);
    });
  }
  const i = Math.max(0, Math.min(index, keys.length));
  return keyBetween(keys[i - 1] ?? null, keys[i] ?? null);
}

/** The section a page goes in: its parent's effective section, or `section` at the top level. */
function sectionFor(tree: Tree, parentId: string | null, section: string | undefined): string | null {
  if (parentId !== null) return tree.byId.get(parentId)?.section ?? null;
  return section ?? null;
}

/**
 * Creates a page in a new document of its own and returns its id. A top-level page needs a
 * `section`; a subpage takes its parent's.
 */
export function createPage(
  docs: PageDocs,
  tree: Tree,
  opts: { parentId?: string | null; section?: string; kind?: PageKind; title?: string; order?: string } = {},
): string {
  const parentId = opts.parentId ?? null;
  const section = sectionFor(tree, parentId, opts.section);
  if (section === null) throw new Error("createPage: a top-level page needs a section, a subpage a known parent");
  const order = opts.order ?? keyForPosition(docs, tree, parentId, section, Number.MAX_SAFE_INTEGER);
  const id = crypto.randomUUID();
  const doc = docs.create(id);
  doc.transact(() => {
    const m = metaMap(doc);
    m.set("title", opts.title ?? "");
    m.set("kind", opts.kind ?? "page");
    m.set("parentId", parentId);
    m.set("section", section);
    m.set("order", order);
    m.set("createdAt", Date.now());
  });
  return id;
}

/**
 * Moves a page to `index` among `parentId`'s children, or among `section`'s top-level pages.
 * Returns false (and does nothing) for an invalid move: into itself, into its own subtree, or
 * into a database. Concurrent moves on other devices can still create a cycle; `buildTree`
 * derives around it. Only the moved page's document is written: its subpages keep their stale
 * `section`, and take the effective one from their top-level ancestor.
 */
export function movePage(
  docs: PageDocs,
  tree: Tree,
  id: string,
  parentId: string | null,
  index: number,
  section?: string,
): boolean {
  if (parentId !== null) {
    const target = tree.byId.get(parentId);
    if (!target || target.page.kind === "database" || isInSubtree(tree, parentId, id)) return false;
  }
  const doc = docs.get(id);
  const node = tree.byId.get(id);
  const to = sectionFor(tree, parentId, section ?? node?.section);
  if (!doc || to === null) return false;
  const order = keyForPosition(docs, tree, parentId, to, index, id);
  doc.transact(() => {
    const m = metaMap(doc);
    m.set("parentId", parentId);
    m.set("section", to);
    m.set("order", order);
  });
  return true;
}

export function renamePage(doc: Y.Doc, title: string): void {
  metaMap(doc).set("title", title);
}

/** Trashing a page hides its whole subtree; restoring it brings the subtree back. */
export function trashPage(doc: Y.Doc): void {
  metaMap(doc).set("deletedAt", Date.now());
}

export function restorePage(docs: PageDocs, tree: Tree, id: string): void {
  const doc = docs.get(id);
  if (!doc) return;
  const m = metaMap(doc);
  doc.transact(() => {
    m.delete("deletedAt");
    // If the old parent is still in the trash, restore to the top level of its section. A parent
    // this device doesn't hold may be one this person can't open: leave that link alone, since
    // writing it would move the page for everyone.
    const parentId = m.get("parentId") as string | null;
    if (parentId && docs.get(parentId) && !tree.byId.has(parentId)) m.set("parentId", null);
  });
}
