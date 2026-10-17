import { atLeast, mostPermissive, type AccessLevel, type PageAccess } from "./levels.ts";
import type { Person } from "./people.ts";
import type { Teamspace } from "./teamspaces.ts";
import { resolveParents, type PageKind, type PageMeta, type Tree, type TreeNode } from "./tree.ts";
import { parseDocName, parseSection, privateSection } from "./workspace.ts";

export type { AccessLevel, PageAccess } from "./levels.ts";

/**
 * The access rules: pure functions from the workspace's people, page tree, sections and the
 * access set on each page to each person's effective level. The server asks them which documents
 * a connection may open and write, and which pages go in each person's page index; clients may
 * ask them what to offer.
 *
 * How a level is worked out (`resolveAccess`, then `levelOf`):
 * 1. Walk the *derived* tree (ADR 7) top-down, so a cycle or a missing parent never leaves a page
 *    without an answer. A top-level page starts from its section's defaults (a Private section
 *    has none: only its member, below; a teamspace has its members' level and, if open, a
 *    non-member level); a subpage starts from its parent's resolved access.
 * 2. The page's own `PageAccess` (`PageMeta.access`) replaces inherited entries key by key: an
 *    invite or override per person, general access for the workspace, and the teamspace
 *    members' level.
 * 3. A person's level is the most permissive of their sources: their per-person entry, the
 *    teamspace members' level (for members), general access (never for guests), and owning the
 *    page's Private section or its teamspace (always Full, and not restrictable).
 */

/** Everything the rules read. */
export interface Workspace {
  people: readonly Person[];
  /** Every page's metadata, including the access set on it, as the server holds it. */
  pages: readonly PageMeta[];
  /** Every teamspace, with its members and default levels (#17). */
  teamspaces?: readonly Teamspace[];
}

/** A page's access after inheritance: what every source gives, before picking one person's level. */
export interface ResolvedAccess {
  /** The page's effective section (its top-level ancestor's). */
  section: string;
  /** Per-person levels from invites and overrides, inherited or set on this page. */
  people: ReadonlyMap<string, AccessLevel>;
  /** General access for everyone in the workspace except guests. */
  workspace: AccessLevel;
  /** The members of the teamspace the page is in (empty outside teamspaces). */
  teamspaceMembers: ReadonlySet<string>;
  /** The teamspace's owners: always Full access on its pages, which no page can lower (the teamspaces spec, Settings). */
  teamspaceOwners: ReadonlySet<string>;
  /** The level those members get: the teamspace's default, or a page's override of it. */
  teamspace: AccessLevel;
}

const resolvedCache = new WeakMap<Workspace, Map<string, ResolvedAccess>>();
const byIdCache = new WeakMap<Workspace, Map<string, PageMeta>>();

/**
 * Every page of the workspace by id. Cached per `Workspace` object like `resolveAccess`: the
 * server asks for every document a device opens and every update it sends, and a scan of every
 * page each time cost about 0.25 s per full resync of 2,000 documents (#22).
 */
function pagesById(workspace: Workspace): ReadonlyMap<string, PageMeta> {
  let byId = byIdCache.get(workspace);
  if (!byId) byIdCache.set(workspace, (byId = new Map(workspace.pages.map((p) => [p.id, p]))));
  return byId;
}

/** A page of the workspace by id, or undefined. */
export function pageById(workspace: Workspace, id: string): PageMeta | undefined {
  return pagesById(workspace).get(id);
}

/** A person in the workspace by id, or undefined. */
export function personById(workspace: Workspace, id: string): Person | undefined {
  return workspace.people.find((p) => p.id === id);
}

/**
 * Every page's resolved access, trashed pages included (trash doesn't change who can open a page).
 * Cached per `Workspace` object, which callers must treat as immutable.
 */
export function resolveAccess(workspace: Workspace): Map<string, ResolvedAccess> {
  const cached = resolvedCache.get(workspace);
  if (cached) return cached;
  const pages = pagesById(workspace);
  const parent = resolveParents(pages);
  const teamspaces = new Map((workspace.teamspaces ?? []).map((t) => [t.id, t]));
  const resolved = new Map<string, ResolvedAccess>();
  const resolve = (id: string): ResolvedAccess => {
    const known = resolved.get(id);
    if (known) return known;
    // resolveParents is acyclic, so this ends; the recursion is as deep as the tree.
    const up = parent.get(id) ?? null;
    const page = pages.get(id)!;
    const inherited: ResolvedAccess =
      up === null ? sectionDefaults(page.section, teamspaces) : resolve(up);
    const result = applyTeamspaceOverride(applyOwnAccess(inherited, page.access), page.access);
    resolved.set(id, result);
    return result;
  };
  for (const id of pages.keys()) resolve(id);
  resolvedCache.set(workspace, resolved);
  return resolved;
}

const NO_MEMBERS: ReadonlySet<string> = new Set();

/**
 * Step 1 for a top-level page: what its section gives before the page sets anything. A Private
 * section gives nothing (its member's Full access is in `levelOf`). A teamspace gives its members
 * the members' default level, and on an open teamspace everyone else in the workspace the
 * non-member level (as general access, which a page can override like any general access).
 */
function sectionDefaults(section: string, teamspaces: ReadonlyMap<string, Teamspace>): ResolvedAccess {
  const s = parseSection(section);
  const ts = s?.kind === "teamspace" ? teamspaces.get(s.teamspaceId) : undefined;
  if (!ts) {
    return {
      section, people: new Map(), workspace: "none", teamspaceMembers: NO_MEMBERS, teamspaceOwners: NO_MEMBERS, teamspace: "none",
    };
  }
  return {
    section,
    people: new Map(),
    workspace: ts.kind === "open" ? ts.workspaceLevel : "none",
    teamspaceMembers: new Set(Object.keys(ts.members)),
    teamspaceOwners: new Set(Object.entries(ts.members).filter(([, role]) => role === "owner").map(([id]) => id)),
    teamspace: ts.memberLevel,
  };
}

/** Step 2, for teamspace members: a page's own members' level replaces the default for it and its subpages. */
function applyTeamspaceOverride(resolved: ResolvedAccess, own: PageAccess | undefined): ResolvedAccess {
  return own?.teamspace === undefined ? resolved : { ...resolved, teamspace: own.teamspace };
}

/** Step 2: the page's own entries replace the inherited ones, key by key. */
function applyOwnAccess(inherited: ResolvedAccess, own: PageAccess | undefined): ResolvedAccess {
  if (!own || (!own.people && own.workspace === undefined)) return inherited;
  const people = new Map(inherited.people);
  for (const [personId, level] of Object.entries(own.people ?? {})) people.set(personId, level);
  return { ...inherited, people, workspace: own.workspace ?? inherited.workspace };
}

/** Step 3: one person's level on a page, from the page's resolved access. */
export function levelOf(person: Person, access: ResolvedAccess): AccessLevel {
  const s = parseSection(access.section);
  // Guests have no Private section (#19): a page that names one gives them nothing of its own.
  if (s?.kind === "private" && s.personId === person.id && person.role !== "guest") return "full";
  if (access.teamspaceOwners.has(person.id)) return "full";
  let level = access.people.get(person.id) ?? "none";
  if (access.teamspaceMembers.has(person.id)) level = mostPermissive(level, access.teamspace);
  if (person.role !== "guest") level = mostPermissive(level, access.workspace);
  return level;
}

/** The level `personId` has on each page they can open. Pages missing from the map are "none". */
export function pageLevels(workspace: Workspace, personId: string): Map<string, AccessLevel> {
  const levels = new Map<string, AccessLevel>();
  const person = personById(workspace, personId);
  if (!person) return levels;
  for (const [id, access] of resolveAccess(workspace)) {
    const level = levelOf(person, access);
    if (level !== "none") levels.set(id, level);
  }
  return levels;
}

/** The ids of the pages `personId` can open: what their page index lists, and what reaches their devices. */
export function visiblePageIds(workspace: Workspace, personId: string): Set<string> {
  return new Set(pageLevels(workspace, personId).keys());
}

/** Only Full access can invite people or change anyone's access (ADR 14). */
export const canShare = (level: AccessLevel): boolean => atLeast(level, "full");

/** Can edit and above change a page's title, place and content. */
export const canEdit = (level: AccessLevel): boolean => atLeast(level, "edit");

/**
 * Why a connection at `level` may not apply an update that changes the page document's
 * `touched` top-level parts (from `touchedRoots`), or null if it may. The server refuses the
 * whole update when this returns a reason.
 * - Below Can edit, any change is refused ("read-only").
 * - Below Full access, a change to `access` is refused ("access-change-refused").
 * - Can edit content (#20) is Can edit on a database's rows (their title, cells, body and order),
 *   and nothing on the database itself: its page (title, place, views, body) and its properties
 *   (`schema`) are its structure ("structure-refused"). On an ordinary page it is read-only.
 * The server applies it to every update through `reviewUpdate` (review.ts). `kind` is the kind of
 * page the document is, or "schema" for a database's properties document.
 */
export function refuseUpdate(
  level: AccessLevel,
  touched: ReadonlySet<string>,
  kind: PageKind | "schema" = "page",
): string | null {
  if (touched.size === 0) return null;
  if (canEdit(level)) return touched.has("access") && !canShare(level) ? "access-change-refused" : null;
  if (level !== "edit-content" || kind === "page") return "read-only";
  if (touched.has("access")) return "access-change-refused";
  return kind === "row" ? null : "structure-refused";
}

/** Can edit content and above may add a row to a database (#20). */
export const canEditContent = (level: AccessLevel): boolean => atLeast(level, "edit-content");

/** View and Comment open a document read-only: the server applies none of the person's updates. */
export const readOnlyAt = (level: AccessLevel): boolean => level === "view" || level === "comment";

/** A person's sidebar sections, each a list of top-level tree nodes in order. */
export interface SidebarSections {
  /**
   * Shown above Private: pages shared with this person (from someone else's section, or below a
   * parent they can't open), and their own Private pages that they have shared.
   */
  shared: TreeNode[];
  private: TreeNode[];
  /**
   * Top-level pages of each teamspace, by teamspace id (#17), whether or not this person has
   * joined it (an open teamspace's pages reach everyone): the app shows joined ones in the sidebar.
   */
  teamspaces: Map<string, TreeNode[]>;
}

/** True if a page's own access gives anyone but `personId` (the section's member) any access. */
export function isSharedByMe(page: PageMeta, personId: string): boolean {
  const own = page.access;
  if (!own) return false;
  if (own.workspace !== undefined && own.workspace !== "none") return true;
  return Object.entries(own.people ?? {}).some(([id, level]) => id !== personId && level !== "none");
}

/**
 * Splits a person's tree (built only from the page documents their device received) into sidebar
 * sections. A top-level page in their own Private section goes in Private, unless they have
 * shared it, or it names a parent the device never received (a page they can open below one they
 * can't): those go in Shared, as does every page from someone else's section.
 *
 * Pass `teamspaceIds`, the teamspaces the device holds (from the person's index), to put a page
 * from a teamspace the person can't see (a guest's, or one in a private teamspace they aren't in)
 * in Shared too: it was shared with them on its own (#19). Without it, every top-level teamspace
 * page goes under its teamspace.
 */
export function sidebarSections(tree: Tree, personId: string, teamspaceIds?: ReadonlySet<string>): SidebarSections {
  const mine = privateSection(personId);
  const sections: SidebarSections = { shared: [], private: [], teamspaces: new Map() };
  for (const node of tree.roots) {
    const s = parseSection(node.section);
    if (s?.kind === "teamspace" && !node.parentHidden && (!teamspaceIds || teamspaceIds.has(s.teamspaceId))) {
      sections.teamspaces.set(s.teamspaceId, [...(sections.teamspaces.get(s.teamspaceId) ?? []), node]);
    } else if (node.section === mine && !node.parentHidden && !isSharedByMe(node.page, personId)) sections.private.push(node);
    else sections.shared.push(node);
  }
  return sections;
}

/**
 * The level `person` has on a teamspace's document (its name, settings and members, not its
 * pages). Below Full, what they may change is checked by `refuseTeamspaceChange`.
 * - Teamspace owners: Full. Members, and workspace owners (who manage every teamspace and so
 *   see even private ones' names): Can edit (to leave, add people, or set the default flag).
 * - Other workspace members: Can edit on an open teamspace (to join it), Can view on a closed
 *   one, and nothing on a private one.
 * - Guests: nothing. A teamspace the server has never seen is one being created: Full for members.
 */
export function teamspaceAccess(workspace: Workspace, person: Person, teamspaceId: string): AccessLevel {
  if (person.role === "guest") return "none";
  const ts = workspace.teamspaces?.find((t) => t.id === teamspaceId);
  if (!ts) return "full";
  const role = ts.members[person.id];
  if (role === "owner") return "full";
  if (role === "member" || person.role === "owner") return "edit";
  return ts.kind === "open" ? "edit" : ts.kind === "closed" ? "view" : "none";
}

/** The teamspaces whose documents `personId` may open, with their level: what their page index lists. */
export function visibleTeamspaces(workspace: Workspace, personId: string): Map<string, AccessLevel> {
  const out = new Map<string, AccessLevel>();
  const person = personById(workspace, personId);
  if (!person) return out;
  for (const ts of workspace.teamspaces ?? []) {
    const level = teamspaceAccess(workspace, person, ts.id);
    if (level !== "none") out.set(ts.id, level);
  }
  return out;
}

/**
 * The level `person` has on a database's properties document (`schema:<databaseId>`, #20): their
 * level on the database page, or Can view if they can only open some of its rows (showing a row
 * needs the property names and types). Who may *change* the properties is `refuseUpdate`'s to say:
 * Can edit content may not. A database the server has never seen is one being created, opened as
 * an unknown page is (`documentAccess`); its page is checked where it is placed.
 */
export function schemaAccess(
  workspace: Workspace,
  person: Person,
  databaseId: string,
  levels?: ReadonlyMap<string, AccessLevel>,
): AccessLevel {
  const database = pageById(workspace, databaseId);
  if (!database) return newDocumentLevel(person);
  if (database.kind !== "database") return "none";
  const mine = levels ?? pageLevels(workspace, person.id);
  const level = mine.get(databaseId);
  if (level) return level;
  const isRow = (p: PageMeta) => p.kind === "row" && p.parentId === databaseId && mine.has(p.id);
  return workspace.pages.some(isRow) ? "view" : "none";
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
  const person = personById(workspace, personId);
  const doc = parseDocName(documentName);
  if (!person || !doc) return "none";
  if (doc.kind === "index") return doc.personId === personId ? "view" : "none";
  if (doc.kind === "teamspace") return teamspaceAccess(workspace, person, doc.teamspaceId);
  if (doc.kind === "schema") return schemaAccess(workspace, person, doc.databaseId, levels);
  if (pageById(workspace, doc.id)) {
    return (levels ?? pageLevels(workspace, personId)).get(doc.id) ?? "none";
  }
  return newDocumentLevel(person);
}

/**
 * The level `person` opens a page or database the server has never seen at: one this device is
 * creating, whose first update is checked against where it puts the page (`reviewUpdate`,
 * `placementLevel`). Members and owners open it at Full. Guests open it at Can edit: with no
 * Private section and no teamspaces, the only place they can edit is inside a page shared with
 * them, so that is the only place their first update can put it (#19).
 */
function newDocumentLevel(person: Person): AccessLevel {
  return person.role === "guest" ? "edit" : "full";
}
