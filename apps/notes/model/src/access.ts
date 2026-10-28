import { mostPermissive, type AccessLevel } from "./levels.ts";
import type { Page } from "./page.ts";
import { resolveParents } from "./tree.ts";

/**
 * What the access rules read, as the server holds it (ADR-NOTE-010's catalog). Callers treat it
 * as immutable.
 */
export interface Catalog {
  /** Every page by id, trashed ones included: the Trash doesn't change who can open a page. */
  pages: ReadonlyMap<string, Page>;
  /** Each workspace's members by workspace id. */
  members: ReadonlyMap<string, ReadonlySet<string>>;
}

/** A page's access after inheritance, before picking one person's level. */
export interface ResolvedAccess {
  people: ReadonlyMap<string, AccessLevel>;
  workspace: AccessLevel;
}

/**
 * Every page's resolved access. Walks the derived tree (`resolveParents`) top-down, so a cycle or
 * a missing parent still leaves every page an answer. A top-level page starts from nothing; a
 * subpage from its parent. The page's own entries then replace the inherited ones key by key.
 */
export function resolveAccess(
  pages: ReadonlyMap<string, Page>,
): Map<string, ResolvedAccess> {
  const parent = resolveParents(pages);
  const resolved = new Map<string, ResolvedAccess>();
  const resolve = (id: string): ResolvedAccess => {
    const known = resolved.get(id);
    if (known) return known;
    const up = parent.get(id) ?? null;
    // resolveParents is acyclic, so the recursion ends.
    const inherited: ResolvedAccess =
      up === null ? { people: new Map(), workspace: "none" } : resolve(up);
    const own = pages.get(id)!.access;
    const result: ResolvedAccess = {
      people: new Map([...inherited.people, ...Object.entries(own.people)]),
      workspace: own.workspace ?? inherited.workspace,
    };
    resolved.set(id, result);
    return result;
  };
  for (const id of pages.keys()) resolve(id);
  return resolved;
}

/**
 * One person's level from a page's resolved access: the most permissive of their own entry and
 * general access (ADR-NOTE-012), and nothing outside the page's workspace.
 */
function levelFrom(
  access: ResolvedAccess,
  personId: string,
  isMember: boolean,
): AccessLevel {
  if (!isMember) return "none";
  return mostPermissive(
    access.people.get(personId) ?? "none",
    access.workspace,
  );
}

/**
 * The level `personId` has on each page they can open: what their index lists and what reaches
 * their devices. Pages left out are No access. Works out the whole tree, so a caller checking
 * many documents for one person asks once.
 */
export function pageLevels(
  catalog: Catalog,
  personId: string,
): Map<string, AccessLevel> {
  const levels = new Map<string, AccessLevel>();
  for (const [id, access] of resolveAccess(catalog.pages)) {
    const workspaceId = catalog.pages.get(id)!.workspaceId;
    const isMember = catalog.members.get(workspaceId)?.has(personId) === true;
    const level = levelFrom(access, personId, isMember);
    if (level !== "none") levels.set(id, level);
  }
  return levels;
}

export function levelOn(
  catalog: Catalog,
  personId: string,
  pageId: string,
): AccessLevel {
  return pageLevels(catalog, personId).get(pageId) ?? "none";
}
