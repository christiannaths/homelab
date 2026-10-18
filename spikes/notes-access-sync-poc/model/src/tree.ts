import type { PageAccess } from "./levels.ts";
import { compareOrder } from "./order.ts";

/**
 * A "row" is a database row (#20): a page of its own whose parent is its database. It inherits the
 * database's access like any subpage, but it isn't a sidebar page: it is shown inside its database.
 */
export type PageKind = "page" | "database" | "row";
const PAGE_KINDS: readonly PageKind[] = ["page", "database", "row"];
export const isPageKind = (value: unknown): value is PageKind =>
  PAGE_KINDS.some((kind) => kind === value);

export interface PageMeta {
  id: string;
  title: string;
  kind: PageKind;
  parentId: string | null;
  /**
   * The sidebar section the page was last placed in, such as `private:<personId>`. Only a
   * top-level page's section counts: a subpage takes its section from its top-level ancestor.
   * Every page still carries one, so a page whose parent is missing or that breaks a cycle
   * has a section to fall back to.
   */
  section: string;
  order: string;
  createdAt: number;
  deletedAt?: number;
  /** Access set on this page itself (invites, overrides, general access). Absent = inherits everything. */
  access?: PageAccess;
}

export interface TreeNode {
  page: PageMeta;
  /** The parent actually used, after repairing cycles and dangling references. */
  parentId: string | null;
  /** The effective section: the section of this node's top-level ancestor (its own, if it is top level). */
  section: string;
  /** True if the page names a parent that isn't in the list, such as a parent this person can't open. */
  parentHidden: boolean;
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
 * - a parent that doesn't exist becomes the root, and so does a database, except for its rows
 * - a cycle (from two concurrent moves) is broken at its smallest id, which becomes a root
 */
export function resolveParents(
  pages: ReadonlyMap<string, PageMeta>,
): Map<string, string | null> {
  const parent = new Map<string, string | null>();
  for (const p of pages.values()) {
    const target = p.parentId ? pages.get(p.parentId) : undefined;
    const allowed =
      target &&
      target.id !== p.id &&
      (target.kind !== "database" || p.kind === "row");
    parent.set(p.id, allowed ? target.id : null);
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
    if (!isTrashed(p.id)) {
      const parentHidden = p.parentId !== null && !pages.has(p.parentId);
      byId.set(p.id, {
        page: p,
        parentId: parent.get(p.id) ?? null,
        section: p.section,
        parentHidden,
        children: [],
        depth: 0,
      });
    }
  }
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId === null) roots.push(node);
    else byId.get(node.parentId)!.children.push(node);
  }
  const sortAndDepth = (
    nodes: TreeNode[],
    depth: number,
    section: string | null,
  ) => {
    nodes.sort((a, b) => comparePages(a.page, b.page));
    for (const n of nodes) {
      n.depth = depth;
      if (section !== null) n.section = section;
      sortAndDepth(n.children, depth + 1, n.section);
    }
  };
  sortAndDepth(roots, 0, null);

  const trash = list
    .filter(
      (p) => p.deletedAt && !(parent.get(p.id) && isTrashed(parent.get(p.id)!)),
    )
    .toSorted((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));

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

/**
 * Depth-first list of nodes, skipping the children of collapsed nodes: the sidebar's lines. A
 * database's children are its rows, which the database shows itself, so they are never listed.
 */
export function flattenVisible(
  tree: Pick<Tree, "roots">,
  expanded: (id: string) => boolean,
): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      out.push(n);
      if (
        n.children.length &&
        n.page.kind !== "database" &&
        expanded(n.page.id)
      )
        walk(n.children);
    }
  };
  walk(tree.roots);
  return out;
}

/**
 * Each page's effective section, trashed pages included: the section of its top-level ancestor in
 * the derived tree (`resolveParents`), so a page with a missing parent, or the page a cycle is
 * broken at, falls back to its own section.
 */
export function effectiveSections(
  list: readonly PageMeta[],
): Map<string, string> {
  const pages = new Map(list.map((p) => [p.id, p]));
  const parent = resolveParents(pages);
  const sections = new Map<string, string>();
  for (const start of pages.keys()) {
    const path: string[] = [];
    let cur = start;
    let section: string | undefined;
    // Walk up to a page whose section is known, or to a top-level page. resolveParents is acyclic.
    for (;;) {
      section = sections.get(cur);
      if (section !== undefined) break;
      path.push(cur);
      const up = parent.get(cur) ?? null;
      if (up === null) {
        section = pages.get(cur)!.section;
        break;
      }
      cur = up;
    }
    for (const id of path) sections.set(id, section);
  }
  return sections;
}
