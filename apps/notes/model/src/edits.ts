import { resolveAccess } from "./access.ts";
import { newLastOrder } from "./order.ts";
import { PRIVATE_SECTION, type Page, type PagePatch } from "./page.ts";
import { buildTree, resolveParents, type Tree } from "./tree.ts";

/** The order key that puts a new page after the live pages under `parentId` (null: the top level). */
export function newLastChildOrder(tree: Tree, parentId: string | null): string {
  const siblings =
    parentId === null ? tree.roots : (tree.byId.get(parentId)?.children ?? []);
  return newLastOrder(siblings.map((n) => n.page.order));
}

/**
 * A page `creatorId` adds at the end of the Private section, or of `parentId`'s subpages. A
 * top-level page gets its creator at Full access: nothing above it gives anyone access. A subpage
 * sets none and inherits (spec #130). Throws if `parentId` isn't a live page in `tree`.
 */
export function newPage(
  tree: Tree,
  opts: {
    id: string;
    workspaceId: string;
    parentId: string | null;
    creatorId: string;
    now: number;
  },
): Page {
  if (opts.parentId !== null && !tree.byId.has(opts.parentId))
    throw new Error(`newPage: no live parent ${opts.parentId}`);
  return {
    id: opts.id,
    workspaceId: opts.workspaceId,
    title: "",
    kind: "page",
    parentId: opts.parentId,
    section: PRIVATE_SECTION,
    order: newLastChildOrder(tree, opts.parentId),
    createdAt: opts.now,
    deletedAt: null,
    access: {
      people: opts.parentId === null ? { [opts.creatorId]: "full" } : {},
    },
  };
}

/** `page` with `patch` written, as its document would read afterwards. */
export function applyPatch(page: Page, patch: PagePatch): Page {
  const { access, ...meta } = patch;
  return {
    ...page,
    ...meta,
    access: {
      ...page.access,
      ...access,
      people: { ...page.access.people, ...access?.people },
    },
  };
}

/** Moving a page to the Trash writes only its own `deletedAt`; its subpages follow in the tree. */
export const trashPatch = (now: number): PagePatch => ({ deletedAt: now });

/**
 * What restoring page `id` from the Trash writes to its document, or null if it isn't in the
 * Trash. Its subpages come back with it, except any trashed on their own before it.
 *
 * If its parent is still in the Trash, it returns to the end of the Private section (spec #130).
 * That move would drop what it inherited, so the inherited entries are written onto the page
 * itself and nobody's level changes. A parent this device never received is left alone: the
 * page may be one the person can open below one they can't, and writing the link would move it
 * for everyone.
 */
export function restorePatch(
  pages: Iterable<Page>,
  id: string,
): PagePatch | null {
  const list = [...pages];
  const target = list.find((p) => p.id === id);
  if (!target) return null;
  const own = new Map(
    list
      .filter((p) => p.workspaceId === target.workspaceId)
      .map((p) => [p.id, p]),
  );
  const tree = buildTree(own.values(), target.workspaceId);
  if (tree.byId.has(id)) return null;
  const patch: PagePatch = target.deletedAt === null ? {} : { deletedAt: null };
  const parentId = resolveParents(own).get(id) ?? null;
  if (parentId === null || tree.byId.has(parentId)) return patch;

  const inherited = resolveAccess(own).get(id)!;
  return {
    ...patch,
    parentId: null,
    order: newLastChildOrder(tree, null),
    access: {
      people: Object.fromEntries(inherited.people),
      ...(inherited.workspace === "none"
        ? {}
        : { workspace: inherited.workspace }),
    },
  };
}
