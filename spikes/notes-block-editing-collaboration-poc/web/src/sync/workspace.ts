import * as Y from "yjs";
import { ensureDatabase } from "../model/database";
import { freshKeys, keyBetween, keysAreUsable } from "../model/order";
import {
  isInSubtree,
  type PageKind,
  type PageMeta,
  type Tree,
  type TreeNode,
} from "../model/tree";

/** One doc per workspace holds the page tree; each page's content is its own doc. */
export const WORKSPACE_DOC = "workspace:default";
export const pageDocName = (id: string) => `page:${id}`;
export const databaseDocName = (id: string) => `db:${id}`;

// Each page is a nested Y.Map so concurrent edits to different fields (e.g. a
// rename and a move) merge instead of one overwriting the other.
export const pagesMap = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>("pages");

export function readPages(doc: Y.Doc): PageMeta[] {
  const pages: PageMeta[] = [];
  pagesMap(doc).forEach((m, id) => {
    pages.push({
      id,
      title: (m.get("title") as string) ?? "",
      kind: (m.get("kind") as PageKind) ?? "page",
      parentId: (m.get("parentId") as string | null) ?? null,
      order: (m.get("order") as string) ?? "",
      createdAt: (m.get("createdAt") as number) ?? 0,
      deletedAt: (m.get("deletedAt") as number | undefined) ?? undefined,
    });
  });
  return pages;
}

function childrenOf(tree: Tree, parentId: string | null): TreeNode[] {
  return parentId === null
    ? tree.roots
    : (tree.byId.get(parentId)?.children ?? []);
}

/**
 * A sort key for a position among `parentId`'s children (ignoring `movingId`).
 * If the siblings' keys are missing or tied (pages from before ordering existed,
 * or two clients that picked the same key), it renumbers them first.
 */
function keyForPosition(
  doc: Y.Doc,
  tree: Tree,
  parentId: string | null,
  index: number,
  movingId?: string,
): string {
  const siblings = childrenOf(tree, parentId).filter(
    (n) => n.page.id !== movingId,
  );
  let keys = siblings.map((n) => n.page.order);
  if (!keysAreUsable(keys)) {
    keys = freshKeys(siblings.length);
    siblings.forEach((n, i) =>
      pagesMap(doc).get(n.page.id)?.set("order", keys[i]),
    );
  }
  const i = Math.max(0, Math.min(index, keys.length));
  return keyBetween(keys[i - 1] ?? null, keys[i] ?? null);
}

export function createPage(
  doc: Y.Doc,
  tree: Tree,
  opts: {
    parentId?: string | null;
    kind?: PageKind;
    title?: string;
    order?: string;
  } = {},
): string {
  const id = crypto.randomUUID();
  const parentId = opts.parentId ?? null;
  doc.transact(() => {
    const m = new Y.Map<unknown>();
    m.set("title", opts.title ?? "");
    m.set("kind", opts.kind ?? "page");
    m.set("parentId", parentId);
    m.set(
      "order",
      opts.order ??
        keyForPosition(doc, tree, parentId, Number.MAX_SAFE_INTEGER),
    );
    m.set("createdAt", Date.now());
    pagesMap(doc).set(id, m);
  });
  return id;
}

/**
 * Moves a page to `index` among `parentId`'s children. Returns false (and does
 * nothing) for an invalid move: into itself, into its own subtree, or into a database.
 * Concurrent moves on other devices can still create a cycle; `buildTree` repairs it.
 */
export function movePage(
  doc: Y.Doc,
  tree: Tree,
  id: string,
  parentId: string | null,
  index: number,
): boolean {
  if (parentId !== null) {
    const target = tree.byId.get(parentId);
    if (
      !target ||
      target.page.kind === "database" ||
      isInSubtree(tree, parentId, id)
    )
      return false;
  }
  const m = pagesMap(doc).get(id);
  if (!m) return false;
  doc.transact(() => {
    const order = keyForPosition(doc, tree, parentId, index, id);
    m.set("parentId", parentId);
    m.set("order", order);
  });
  return true;
}

export function renamePage(doc: Y.Doc, id: string, title: string): void {
  pagesMap(doc).get(id)?.set("title", title);
}

/** Trashing a page hides its whole subtree; restoring it brings the subtree back. */
export function trashPage(doc: Y.Doc, id: string): void {
  pagesMap(doc).get(id)?.set("deletedAt", Date.now());
}

export function restorePage(doc: Y.Doc, tree: Tree, id: string): void {
  const m = pagesMap(doc).get(id);
  if (!m) return;
  doc.transact(() => {
    m.delete("deletedAt");
    // If the old parent is gone or still in the trash, restore to the top level.
    const parentId = m.get("parentId") as string | null;
    if (parentId && !tree.byId.has(parentId)) m.set("parentId", null);
  });
}

/** Creates a database page and initialises its doc. Only the creating device initialises it. */
export function createDatabase(
  workspace: Y.Doc,
  tree: Tree,
  open: (docName: string) => Y.Doc,
  opts: { parentId?: string | null; title?: string } = {},
): string {
  const id = createPage(workspace, tree, { ...opts, kind: "database" });
  ensureDatabase(open(databaseDocName(id)));
  return id;
}
