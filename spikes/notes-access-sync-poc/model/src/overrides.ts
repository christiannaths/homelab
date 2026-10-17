import type { AccessLevel } from "./levels.ts";
import { resolveParents, type PageMeta, type Tree, type TreeNode } from "./tree.ts";

/**
 * Views of how a page's access is inherited and overridden, for the Share menu and the page
 * header. The rules themselves are in `access.ts` (`resolveAccess`); these only explain them, from
 * the page documents a device holds.
 */

/** One per-person entry in a page's Share menu. */
export interface ShareEntry {
  personId: string;
  /** The entry's level on this page. "none" is a restriction to No access. */
  level: AccessLevel;
  /** The page that sets it: this page (an invite or an override) or the ancestor it is inherited from. */
  from: string;
  /** Set on this page over an inherited entry: the level that Restore inherited access goes back to. */
  overrides?: AccessLevel;
}

/** A page's general access (everyone in the workspace) in its Share menu. */
export interface GeneralAccess {
  level: AccessLevel;
  /** The page that sets it, or null if no page above sets it ("Only people invited"). */
  from: string | null;
  /** As for `ShareEntry.overrides`. */
  overrides?: AccessLevel;
}

export interface ShareEntries {
  /** Entries set on this page first, then inherited ones, nearest ancestor first. */
  people: ShareEntry[];
  workspace: GeneralAccess;
  /**
   * True if the page's top-level ancestor on this device names a parent the device doesn't hold:
   * entries inherited from above it can't be listed (they may give people more than shown).
   */
  inheritsFromHidden: boolean;
}

/**
 * The Share menu's view of `pageId`: every per-person entry and the general access it has, with
 * where each comes from. Built from `pages`, the page documents a device holds, so it follows the
 * same derived tree (ADR-NOTE-006) as the access rules. Section members and teamspace defaults are not
 * entries.
 */
export function shareEntries(pages: readonly PageMeta[], pageId: string): ShareEntries {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const parent = resolveParents(byId);
  // This page, then each ancestor up to the top level.
  const chain: PageMeta[] = [];
  for (let id: string | null = pageId; id !== null; id = parent.get(id) ?? null) chain.push(byId.get(id)!);
  const top = chain[chain.length - 1];

  const people: ShareEntry[] = [];
  const seen = new Set<string>();
  for (const [i, p] of chain.entries()) {
    for (const [personId, level] of Object.entries(p.access?.people ?? {})) {
      if (seen.has(personId)) continue;
      seen.add(personId);
      const below = i === 0 ? chain.slice(1).find((a) => a.access?.people?.[personId] !== undefined) : undefined;
      const entry: ShareEntry = { personId, level, from: p.id };
      if (below) entry.overrides = below.access!.people![personId];
      people.push(entry);
    }
  }

  const general = chain.findIndex((p) => p.access?.workspace !== undefined);
  let workspace: GeneralAccess = { level: "none", from: null };
  if (general !== -1) {
    workspace = { level: chain[general].access!.workspace!, from: chain[general].id };
    const below = general === 0 ? chain.slice(1).find((p) => p.access?.workspace !== undefined) : undefined;
    if (below) workspace.overrides = below.access!.workspace!;
  }

  return { people, workspace, inheritsFromHidden: top.parentId !== null && !byId.has(top.parentId) };
}

/**
 * The page's ancestors and the page itself, top-level first, in a device's tree. A parent the
 * device doesn't hold ends the breadcrumb, since the page is top-level in that tree, so no trace
 * of a hidden parent is shown. Empty if the page isn't in the tree.
 */
export function breadcrumb(tree: Tree, pageId: string): TreeNode[] {
  const out: TreeNode[] = [];
  for (let node = tree.byId.get(pageId); node; node = node.parentId ? tree.byId.get(node.parentId) : undefined) {
    out.unshift(node);
  }
  return out;
}
