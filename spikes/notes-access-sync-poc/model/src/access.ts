import type { Person } from "./people.ts";
import { effectiveSections, type PageMeta, type Tree, type TreeNode } from "./tree.ts";
import { parseDocName, parseSection, privateSection } from "./workspace.ts";

/**
 * The access rules: pure functions from the workspace's people, page tree and (later) teamspaces
 * and grants to each person's effective level. The server asks them which documents a connection
 * may open and write, and which pages go in each person's page index; clients may ask them what
 * to offer.
 *
 * So far only Private pages exist: a page in someone's Private section (directly, or below a page
 * that is) is theirs alone. Access follows the *derived* tree (ADR 7), the same one every device
 * builds, so a cycle or a missing parent never leaves a page without an answer.
 */

/** Notion's page access levels, most permissive first. */
export type AccessLevel = "full" | "edit" | "edit-content" | "comment" | "view" | "none";

/** Everything the rules read. Grows as the spike adds teamspaces and grants. */
export interface Workspace {
  people: readonly Person[];
  /** Every page's metadata, as the server holds it. */
  pages: readonly PageMeta[];
}

/** The level `personId` has on each page they can open. Pages missing from the map are "none". */
export function pageLevels(workspace: Workspace, personId: string): Map<string, AccessLevel> {
  const levels = new Map<string, AccessLevel>();
  if (!workspace.people.some((p) => p.id === personId)) return levels;
  for (const [id, section] of effectiveSections(workspace.pages)) {
    const s = parseSection(section);
    if (s?.kind === "private" && s.personId === personId) levels.set(id, "full");
  }
  return levels;
}

/** The ids of the pages `personId` can open: what their page index lists, and what reaches their devices. */
export function visiblePageIds(workspace: Workspace, personId: string): Set<string> {
  return new Set(pageLevels(workspace, personId).keys());
}

/** A person's sidebar sections, each a list of top-level tree nodes in order. Teamspaces come later. */
export interface SidebarSections {
  /** Shown above Private: pages this person can open whose parent they can't, and (later) pages shared with them. */
  shared: TreeNode[];
  private: TreeNode[];
}

/**
 * Splits a person's tree (built only from the page documents their device received) into sidebar
 * sections. A top-level page in their own Private section goes in Private, unless it names a parent
 * the device never received: then it is a page they can open below one they can't, and goes in Shared.
 */
export function sidebarSections(tree: Tree, personId: string): SidebarSections {
  const mine = privateSection(personId);
  const sections: SidebarSections = { shared: [], private: [] };
  for (const node of tree.roots) {
    if (node.section === mine && !node.parentHidden) sections.private.push(node);
    else sections.shared.push(node);
  }
  return sections;
}

/**
 * The level `personId` has on the Yjs document named `documentName`. Pass `levels` (from
 * `pageLevels`) to avoid recomputing the tree for every document a device opens.
 */
export function documentAccess(
  workspace: Workspace,
  personId: string,
  documentName: string,
  levels?: ReadonlyMap<string, AccessLevel>,
): AccessLevel {
  const person = workspace.people.find((p) => p.id === personId);
  const doc = parseDocName(documentName);
  if (!person || !doc) return "none";
  if (doc.kind === "index") return doc.personId === personId ? "view" : "none";
  if (workspace.pages.some((p) => p.id === doc.id)) {
    return (levels ?? pageLevels(workspace, personId)).get(doc.id) ?? "none";
  }
  // A page the server has never seen is one this device is creating. Members and owners can
  // create pages; guests only create subpages inside pages shared with them (a later ticket).
  return person.role === "guest" ? "none" : "full";
}
