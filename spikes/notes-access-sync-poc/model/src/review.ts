import * as Y from "yjs";
import { canEdit, canShare, documentAccess, pageLevels, refuseUpdate, type Workspace } from "./access.ts";
import type { AccessLevel } from "./levels.ts";
import type { PageMeta } from "./tree.ts";
import { previewUpdate } from "./updates.ts";
import { parseDocName, readMeta } from "./workspace.ts";

/**
 * Why the server refused an update (#18). It is the reason on the document's close message, the
 * only part of a close Hocuspocus passes on to the device, so it is how a device tells "your
 * update was refused, get back in step" apart from any other close.
 * - "read-only": the person is below Can edit on the document (or can no longer open it).
 * - "access-change-refused": the update changes the page's access, which needs Full access.
 * - "placement-refused": a new page placed where its creator can't edit, such as someone else's
 *   Private section or under a page they can only view.
 */
export const REFUSALS = ["read-only", "access-change-refused", "placement-refused"] as const;

export type Refusal = (typeof REFUSALS)[number];

export function isRefusal(reason: unknown): reason is Refusal {
  return typeof reason === "string" && (REFUSALS as readonly string[]).includes(reason);
}

/**
 * The level `personId` would have on a page the server has never seen, placed as `meta` says,
 * before the page sets any access of its own: what its place in the tree gives its creator. A
 * new page in their own Private section is Full; a subpage gets what they have on the parent; a
 * page in someone else's Private section gets nothing. Its own `access` doesn't count, because
 * that is what is being checked.
 */
export function placementLevel(workspace: Workspace, personId: string, meta: PageMeta): AccessLevel {
  const page: PageMeta = { ...meta, access: undefined };
  const pages = [...workspace.pages.filter((p) => p.id !== meta.id), page];
  return pageLevels({ ...workspace, pages }, personId).get(meta.id) ?? "none";
}

/**
 * Whether `personId` may apply `update` to the document `documentName`, which the server holds as
 * `doc`. Returns why not, or null if they may. The whole update is refused or applied, never part
 * of it.
 * - A known document is checked against the person's level on it **now** (not when it was
 *   opened), so access changes made since apply at once. Full access may change anything but
 *   where the page goes, and an update from Full access that can't move it is accepted without
 *   copying the document.
 * - A move of a known page (a new `parentId` or `section`) is also checked at both ends
 *   (`reviewMove`).
 * - A page the server has never seen is being created by this update. It is checked as if it
 *   already existed where the update places it, with no access of its own (`placementLevel`):
 *   creating it needs Can edit there, and any access it sets needs Full access there.
 * An update that changes nothing the server lacks (a resync after reconnecting) is always fine.
 */
export function reviewUpdate(
  workspace: Workspace,
  personId: string,
  documentName: string,
  doc: Y.Doc,
  update: Uint8Array,
  levels?: ReadonlyMap<string, AccessLevel>,
): Refusal | null {
  const ref = parseDocName(documentName);
  const before = ref?.kind === "page" ? workspace.pages.find((p) => p.id === ref.id) : undefined;
  const isNewPage = ref?.kind === "page" && !before;
  const level = isNewPage ? null : documentAccess(workspace, personId, documentName, levels);
  const mayMove = before !== undefined && writesPlacement(doc, update);
  if (level === "full" && !mayMove) return null;
  const { touched, copy } = previewUpdate(doc, update);
  try {
    if (touched.size === 0) return null;
    if (level !== null) {
      const refused = asRefusal(refuseUpdate(level, touched));
      if (refused || !mayMove) return refused;
      const after = readMeta(before.id, copy);
      return after ? reviewMove(workspace, personId, level, before, after) : null;
    }
    const meta = ref?.kind === "page" ? readMeta(ref.id, copy) : null;
    const placed = meta ? placementLevel(workspace, personId, meta) : "none";
    if (!canEdit(placed)) return "placement-refused";
    return asRefusal(refuseUpdate(placed, touched));
  } finally {
    copy.destroy();
  }
}

/**
 * Whether `personId`, at `level` on an existing page, may move it from where `before` places it to
 * where `after` does (a new `parentId` or `section`). Notion-style rules (ADR 14):
 * - The destination must be somewhere the mover could create the page (`placementLevel` at least
 *   Can edit), so nobody can put a page in someone else's Private section, or under a page they
 *   can only view, even with Full access to the page itself.
 * - A move that changes anyone's level on the page or below it (out of a shared page into the
 *   mover's Private section, into another sharer's page, …) is a change of access, so it needs
 *   Full access on the page where it is now. Can edit may still move it where nobody's access
 *   changes, such as under a sibling inside the same shared page.
 * A move into the page's own subtree is left to `buildTree`, which derives around the cycle.
 */
export function reviewMove(
  workspace: Workspace,
  personId: string,
  level: AccessLevel,
  before: PageMeta,
  after: PageMeta,
): Refusal | null {
  if (before.parentId === after.parentId && before.section === after.section) return null;
  if (!canEdit(placementLevel(workspace, personId, after))) return "placement-refused";
  if (canShare(level)) return null;
  const moved: Workspace = { ...workspace, pages: workspace.pages.map((p) => (p.id === after.id ? after : p)) };
  for (const person of workspace.people) {
    const was = pageLevels(workspace, person.id);
    const now = pageLevels(moved, person.id);
    if (was.size !== now.size || [...was].some(([id, l]) => now.get(id) !== l)) return "access-change-refused";
  }
  return null;
}

/**
 * A cheap first look, without copying the document: could `update` write a `parentId` or
 * `section` key? Only then can it move a page, so other updates from Full access are accepted
 * without a copy. The encoding leaves a map entry's key out when the entry follows an earlier one
 * (its `origin`), so the key is read from that earlier entry in `doc`. Anything it can't tell
 * (an origin `doc` lacks or has garbage-collected) counts as a possible move and gets the full
 * check, as does an XML attribute with the same name.
 */
function writesPlacement(doc: Y.Doc, update: Uint8Array): boolean {
  const isPlacementKey = (key: string | null) => key === "parentId" || key === "section";
  return Y.decodeUpdate(update).structs.some((s) => {
    if (!(s instanceof Y.Item)) return false;
    if (s.parentSub !== null) return isPlacementKey(s.parentSub);
    if (s.parent !== null || s.origin === null) return false; // positioned by its parent, so not a map entry that follows another
    if (Y.getState(doc.store, s.origin.client) <= s.origin.clock) return true;
    const origin = Y.getItem(doc.store, s.origin);
    return !(origin instanceof Y.Item) || isPlacementKey(origin.parentSub);
  });
}

const asRefusal =(reason: string | null): Refusal | null => (reason === null ? null : isRefusal(reason) ? reason : "read-only");
