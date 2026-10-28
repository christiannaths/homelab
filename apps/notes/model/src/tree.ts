import { compareOrder } from "./order.ts";
import type { Page } from "./page.ts";

export interface TreeNode {
  page: Page;
  /** The parent actually used, after cycles and missing parents are derived around. */
  parentId: string | null;
  /** The page names a parent that isn't here, such as one this device never received. */
  parentMissing: boolean;
  children: TreeNode[];
  depth: number;
}

/**
 * One workspace's pages as a person's device sees them (ADR-NOTE-006 rule 1: derived, never
 * repaired). Code reads this, not the raw `parentId`s, which may form cycles.
 */
export interface Tree {
  /** The live top-level pages: the Private section. */
  roots: TreeNode[];
  /** Live pages only. */
  byId: ReadonlyMap<string, TreeNode>;
  /** The top of each trashed subtree, newest first, with its subpages as children. */
  trash: TreeNode[];
}

function comparePages(a: Page, b: Page): number {
  return (
    compareOrder(a.order, b.order) ||
    a.createdAt - b.createdAt ||
    compareOrder(a.id, b.id)
  );
}

/**
 * Each page's effective parent. Every device runs this on the same pages and gets the same answer
 * (ADR-NOTE-006 rule 1):
 * - a parent that isn't in `pages`, or is in another workspace, counts as missing: top level;
 * - a cycle from concurrent edits breaks at its smallest id, which becomes top level.
 */
export function resolveParents(
  pages: ReadonlyMap<string, Page>,
): Map<string, string | null> {
  const parent = new Map<string, string | null>();
  for (const p of pages.values()) {
    const target = p.parentId === null ? undefined : pages.get(p.parentId);
    const usable =
      target !== undefined &&
      target.id !== p.id &&
      target.workspaceId === p.workspaceId;
    parent.set(p.id, usable ? target.id : null);
  }

  const acyclic = new Set<string>();
  for (const start of pages.keys()) {
    const path: string[] = [];
    const onPath = new Set<string>();
    let cur: string | null = start;
    while (cur !== null && !acyclic.has(cur)) {
      if (onPath.has(cur)) {
        const cycle = path.slice(path.indexOf(cur));
        parent.set(
          cycle.reduce((min, id) => (id < min ? id : min)),
          null,
        );
        path.length = 0;
        onPath.clear();
        cur = start;
        continue;
      }
      path.push(cur);
      onPath.add(cur);
      cur = parent.get(cur) ?? null;
    }
    for (const id of path) acyclic.add(id);
  }
  return parent;
}

/** Whether each page is in the Trash: trashed itself, or below a page that is. */
function trashedPages(
  pages: ReadonlyMap<string, Page>,
  parent: ReadonlyMap<string, string | null>,
): Map<string, boolean> {
  const trashed = new Map<string, boolean>();
  const isTrashed = (id: string): boolean => {
    const known = trashed.get(id);
    if (known !== undefined) return known;
    const up = parent.get(id) ?? null;
    // resolveParents is acyclic, so the recursion ends.
    const result =
      pages.get(id)?.deletedAt != null || (up !== null && isTrashed(up));
    trashed.set(id, result);
    return result;
  };
  for (const id of pages.keys()) isTrashed(id);
  return trashed;
}

/** The tree of `workspaceId`'s pages among `pages`; other workspaces' pages are left out. */
export function buildTree(pages: Iterable<Page>, workspaceId: string): Tree {
  const own = new Map<string, Page>();
  for (const p of pages) if (p.workspaceId === workspaceId) own.set(p.id, p);
  const parent = resolveParents(own);
  const trashed = trashedPages(own, parent);

  const nodes = new Map<string, TreeNode>();
  for (const p of own.values())
    nodes.set(p.id, {
      page: p,
      parentId: parent.get(p.id) ?? null,
      parentMissing: p.parentId !== null && !own.has(p.parentId),
      children: [],
      depth: 0,
    });

  const roots: TreeNode[] = [];
  const trash: TreeNode[] = [];
  const byId = new Map<string, TreeNode>();
  for (const node of nodes.values()) {
    const up = node.parentId === null ? undefined : nodes.get(node.parentId);
    const inTrash = trashed.get(node.page.id) === true;
    if (!inTrash) byId.set(node.page.id, node);
    if (up && trashed.get(up.page.id) === inTrash) up.children.push(node);
    else (inTrash ? trash : roots).push(node);
  }

  const sortAndDepth = (list: TreeNode[], depth: number) => {
    list.sort((a, b) => comparePages(a.page, b.page));
    for (const n of list) {
      n.depth = depth;
      sortAndDepth(n.children, depth + 1);
    }
  };
  sortAndDepth(roots, 0);
  for (const n of trash) sortAndDepth(n.children, 1);
  trash.sort(
    (a, b) =>
      (b.page.deletedAt ?? 0) - (a.page.deletedAt ?? 0) ||
      compareOrder(a.page.id, b.page.id),
  );
  return { roots, byId, trash };
}

/** A live page's ancestors from the top down, for its breadcrumb. */
export function ancestors(tree: Tree, id: string): TreeNode[] {
  const out: TreeNode[] = [];
  for (
    let cur = tree.byId.get(id)?.parentId ?? null;
    cur !== null;
    cur = tree.byId.get(cur)?.parentId ?? null
  ) {
    const node = tree.byId.get(cur);
    if (!node) break;
    out.unshift(node);
  }
  return out;
}
