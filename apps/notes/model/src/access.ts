import { mostPermissive, type AccessLevel } from "./levels.ts";
import type { Page } from "./page.ts";
import { namedParent, resolveParents } from "./tree.ts";

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
    const result = inherit(
      up === null ? TOP_LEVEL : resolve(up),
      pages.get(id)!.access,
    );
    resolved.set(id, result);
    return result;
  };
  for (const id of pages.keys()) resolve(id);
  return resolved;
}

const TOP_LEVEL: ResolvedAccess = { people: new Map(), workspace: "none" };

/** A page's own entries replace what it inherits key by key. */
const inherit = (
  inherited: ResolvedAccess,
  own: Page["access"],
): ResolvedAccess => ({
  people: new Map([...inherited.people, ...Object.entries(own.people)]),
  workspace: own.workspace ?? inherited.workspace,
});

/**
 * Page `id` and the pages above it, bottom up, as `resolveParents` derives them: a cycle breaks
 * at its smallest id. Walks only this chain, not the whole tree.
 */
function derivedChain(pages: ReadonlyMap<string, Page>, id: string): string[] {
  const chain: string[] = [];
  const at = new Map<string, number>();
  for (let cur: string | null = id; cur !== null;) {
    const seenAt = at.get(cur);
    if (seenAt !== undefined) {
      const smallest = chain
        .slice(seenAt)
        .reduce((min, i) => (i < min ? i : min));
      return chain.slice(0, chain.indexOf(smallest) + 1);
    }
    at.set(cur, chain.length);
    chain.push(cur);
    cur = namedParent(pages, pages.get(cur)!);
  }
  return chain;
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
 * many documents for one person asks once; one asking for many people passes `resolved`, from
 * `resolveAccess`, to work it out once.
 */
export function pageLevels(
  catalog: Catalog,
  personId: string,
  resolved: ReadonlyMap<string, ResolvedAccess> = resolveAccess(catalog.pages),
): Map<string, AccessLevel> {
  const levels = new Map<string, AccessLevel>();
  for (const [id, access] of resolved) {
    const workspaceId = catalog.pages.get(id)!.workspaceId;
    const isMember = catalog.members.get(workspaceId)?.has(personId) === true;
    const level = levelFrom(access, personId, isMember);
    if (level !== "none") levels.set(id, level);
  }
  return levels;
}

/** One person's level on one page, as `pageLevels` gives it, from that page's ancestors only. */
export function levelOn(
  catalog: Catalog,
  personId: string,
  pageId: string,
): AccessLevel {
  const page = catalog.pages.get(pageId);
  if (!page) return "none";
  const access = derivedChain(catalog.pages, pageId).reduceRight(
    (inherited, id) => inherit(inherited, catalog.pages.get(id)!.access),
    TOP_LEVEL,
  );
  const isMember =
    catalog.members.get(page.workspaceId)?.has(personId) === true;
  return levelFrom(access, personId, isMember);
}
