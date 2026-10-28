import { levelOn, pageLevels, type Catalog } from "./access.ts";
import { parseDocName } from "./documents.ts";
import { canEdit, canShare, type AccessLevel } from "./levels.ts";
import { PRIVATE_SECTION, type Page } from "./page.ts";

/**
 * Why the server refused an update: the reason on the document's close message (ADR-NOTE-010),
 * which tells the device to drop its copy and sync it again.
 * - "read-only": below Can edit on the document.
 * - "access-change-refused": changes access without Full access, gives an entry to someone outside
 *   the page's workspace, or moves a page so that someone's level changes without Full access.
 * - "placement-refused": puts a page where its author may not: a workspace they don't belong to,
 *   under a page they can't edit, under itself or a page in the Trash, outside their own Private
 *   section, or into another workspace.
 */
export const REFUSALS = [
  "read-only",
  "access-change-refused",
  "placement-refused",
] as const;

export type Refusal = (typeof REFUSALS)[number];

/** What an update would do to a document, from applying it to a scratch copy (`previewUpdate`). */
export interface DocumentChange {
  /** The top-level parts of the document it changes (`meta`, `access`, `content`, …). */
  touched: ReadonlySet<string>;
  /** For a page document: the page as the update leaves it, or null if its `meta` is incomplete. */
  after?: Page | null;
}

const isMember = (catalog: Catalog, personId: string, workspaceId: string) =>
  catalog.members.get(workspaceId)?.has(personId) === true;

/**
 * The level `personId` opens `documentName` at (ADR-NOTE-010). A page the server has never seen
 * opens at Full access, because this device is creating it: its first update is reviewed against
 * where it puts the page (ADR-NOTE-013, safe only because ids are random).
 */
export function documentLevel(
  catalog: Catalog,
  personId: string,
  documentName: string,
): AccessLevel {
  const ref = parseDocName(documentName);
  if (ref?.kind === "index") return ref.personId === personId ? "view" : "none";
  if (ref?.kind === "workspace")
    return isMember(catalog, personId, ref.id) ? "edit" : "none";
  if (ref?.kind === "page")
    return catalog.pages.has(ref.id)
      ? levelOn(catalog, personId, ref.id)
      : "full";
  return "none";
}

/**
 * Whether `personId` may apply an update that makes `change` to `documentName`, judged on the
 * catalog as it is now (not as it was when the document opened), so access changes apply at
 * once. Returns why not, or null. The server applies or refuses the whole update.
 */
export function reviewUpdate(
  catalog: Catalog,
  personId: string,
  documentName: string,
  change: DocumentChange,
): Refusal | null {
  if (change.touched.size === 0) return null;
  const ref = parseDocName(documentName);
  if (ref?.kind !== "page")
    return canEdit(documentLevel(catalog, personId, documentName))
      ? null
      : "read-only";
  const before = catalog.pages.get(ref.id);
  const after = change.after ?? null;
  if (!before) return reviewNewPage(catalog, personId, after, change.touched);
  return reviewPageChange(catalog, personId, before, after, change.touched);
}

function reviewPageChange(
  catalog: Catalog,
  personId: string,
  before: Page,
  after: Page | null,
  touched: ReadonlySet<string>,
): Refusal | null {
  const level = levelOn(catalog, personId, before.id);
  if (!canEdit(level)) return "read-only";
  if (touched.has("access") && !canShare(level)) return "access-change-refused";
  if (
    !after ||
    after.workspaceId !== before.workspaceId ||
    after.kind !== before.kind
  )
    return "placement-refused";
  if (!entriesAreMembers(catalog, after, before))
    return "access-change-refused";
  if (after.parentId === before.parentId && after.section === before.section)
    return null;

  const moved = withPage(catalog, after);
  if (placementRefused(catalog, moved, personId, after))
    return "placement-refused";
  if (canShare(level) || !levelsChange(catalog, moved, after.workspaceId))
    return null;
  return "access-change-refused";
}

function reviewNewPage(
  catalog: Catalog,
  personId: string,
  after: Page | null,
  touched: ReadonlySet<string>,
): Refusal | null {
  if (!after) return "placement-refused";
  const created = withPage(catalog, after);
  if (placementRefused(catalog, created, personId, after))
    return "placement-refused";
  // A top-level page's own entries are what make it its creator's (checked above); a subpage's
  // are a change to what it inherits, which needs Full access where it is placed.
  if (
    after.parentId !== null &&
    touched.has("access") &&
    !canShare(levelOn(catalog, personId, after.parentId))
  )
    return "access-change-refused";
  return entriesAreMembers(catalog, after) ? null : "access-change-refused";
}

/**
 * Whether `personId` may not put `page` where it says, judged in `placed` (the catalog with the
 * page there). In this slice a page is placed in their own workspace's Private section: at the
 * top level only if it gives them Full access, as their own pages do; as a subpage only under a
 * page of the same workspace they can edit, not below itself and not in the Trash.
 */
function placementRefused(
  catalog: Catalog,
  placed: Catalog,
  personId: string,
  page: Page,
): boolean {
  if (!isMember(catalog, personId, page.workspaceId)) return true;
  if (page.kind !== "page" || page.section !== PRIVATE_SECTION) return true;
  if (page.parentId === null)
    return !canShare(levelOn(placed, personId, page.id));
  const parent = catalog.pages.get(page.parentId);
  return (
    parent === undefined ||
    parent.workspaceId !== page.workspaceId ||
    !canEdit(levelOn(catalog, personId, parent.id)) ||
    cycleOrTrash(catalog, page.id, parent)
  );
}

/**
 * Whether `parent` is page `id` itself or below it, which would make a cycle, or is in the
 * Trash, where a live page can't go.
 */
function cycleOrTrash(catalog: Catalog, id: string, parent: Page): boolean {
  const seen = new Set<string>();
  for (
    let cur: Page | undefined = parent;
    cur !== undefined && !seen.has(cur.id);
    cur = cur.parentId === null ? undefined : catalog.pages.get(cur.parentId)
  ) {
    if (cur.id === id || cur.deletedAt !== null) return true;
    seen.add(cur.id);
  }
  return false;
}

/** Whether every person entry `page` adds or changes (against `before`) is for a workspace member. */
function entriesAreMembers(
  catalog: Catalog,
  page: Page,
  before?: Page,
): boolean {
  return Object.entries(page.access.people).every(
    ([id, level]) =>
      before?.access.people[id] === level ||
      isMember(catalog, id, page.workspaceId),
  );
}

/** Whether any member of `workspaceId` has a different level on any page in `after` than in `before`. */
function levelsChange(
  before: Catalog,
  after: Catalog,
  workspaceId: string,
): boolean {
  for (const personId of before.members.get(workspaceId) ?? []) {
    const was = pageLevels(before, personId);
    const now = pageLevels(after, personId);
    if (was.size !== now.size || [...was].some(([id, l]) => now.get(id) !== l))
      return true;
  }
  return false;
}

function withPage(catalog: Catalog, page: Page): Catalog {
  return { ...catalog, pages: new Map(catalog.pages).set(page.id, page) };
}
