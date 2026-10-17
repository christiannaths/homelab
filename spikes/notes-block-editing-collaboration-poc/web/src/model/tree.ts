import { compareOrder } from "./order";

export type PageKind = "page" | "database";

export interface PageMeta {
  id: string;
  title: string;
  kind: PageKind;
  parentId: string | null;
  order: string;
  createdAt: number;
  deletedAt?: number;
}

export interface TreeNode {
  page: PageMeta;
  /** The parent actually used, after repairing cycles and dangling references. */
  parentId: string | null;
  children: TreeNode[];
  depth: number;
}

export interface Tree {
  roots: TreeNode[];
  /** Live (not trashed) nodes only. */
  byId: Map<string, TreeNode>;
  /** Pages trashed directly (not just because an ancestor was), newest first. */
  trash: PageMeta[];
}

export function comparePages(a: PageMeta, b: PageMeta): number {
  return (
    compareOrder(a.order, b.order) ||
    a.createdAt - b.createdAt ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * Resolves each page's effective parent. Every client runs this on the same
 * data and gets the same answer, so no client needs to write a repair:
 * - a parent that doesn't exist, or is a database, becomes the root
 * - a cycle (from two concurrent moves) is broken at its smallest id, which becomes a root
 */
export function resolveParents(
  pages: Map<string, PageMeta>,
): Map<string, string | null> {
  const parent = new Map<string, string | null>();
  for (const p of pages.values()) {
    const target = p.parentId ? pages.get(p.parentId) : undefined;
    parent.set(
      p.id,
      target && target.kind !== "database" && target.id !== p.id
        ? target.id
        : null,
    );
  }

  const acyclic = new Set<string>();
  for (const start of pages.keys()) {
    const path: string[] = [];
    const onPath = new Set<string>();
    let cur: string | null = start;
    while (cur !== null && !acyclic.has(cur)) {
      if (onPath.has(cur)) {
        const cycle = path.slice(path.indexOf(cur));
        const breaker = cycle.reduce((min, id) => (id < min ? id : min));
        parent.set(breaker, null);
        // Re-walk this path with the cycle broken.
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

export function buildTree(list: PageMeta[]): Tree {
  const pages = new Map(list.map((p) => [p.id, p]));
  const parent = resolveParents(pages);

  // A page is trashed if it or any effective ancestor is.
  const trashedMemo = new Map<string, boolean>();
  const isTrashed = (id: string): boolean => {
    const known = trashedMemo.get(id);
    if (known !== undefined) return known;
    const p = pages.get(id)!;
    const up = parent.get(id) ?? null;
    const result = !!p.deletedAt || (up !== null && isTrashed(up));
    trashedMemo.set(id, result);
    return result;
  };

  const byId = new Map<string, TreeNode>();
  for (const p of list) {
    if (!isTrashed(p.id))
      byId.set(p.id, {
        page: p,
        parentId: parent.get(p.id) ?? null,
        children: [],
        depth: 0,
      });
  }
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId === null) roots.push(node);
    else byId.get(node.parentId)!.children.push(node);
  }
  const sortAndDepth = (nodes: TreeNode[], depth: number) => {
    nodes.sort((a, b) => comparePages(a.page, b.page));
    for (const n of nodes) {
      n.depth = depth;
      sortAndDepth(n.children, depth + 1);
    }
  };
  sortAndDepth(roots, 0);

  const trash = list
    .filter(
      (p) => p.deletedAt && !(parent.get(p.id) && isTrashed(parent.get(p.id)!)),
    )
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));

  return { roots, byId, trash };
}

/** True if `id` is `ancestorId` or below it in the effective tree. */
export function isInSubtree(
  tree: Tree,
  id: string,
  ancestorId: string,
): boolean {
  for (
    let cur: string | null = id;
    cur !== null;
    cur = tree.byId.get(cur)?.parentId ?? null
  ) {
    if (cur === ancestorId) return true;
  }
  return false;
}

/** Depth-first list of nodes, skipping the children of collapsed nodes: the sidebar's rows. */
export function flattenVisible(
  tree: Tree,
  expanded: (id: string) => boolean,
): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      out.push(n);
      if (n.children.length && expanded(n.page.id)) walk(n.children);
    }
  };
  walk(tree.roots);
  return out;
}
