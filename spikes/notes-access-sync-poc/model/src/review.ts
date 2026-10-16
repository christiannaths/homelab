import type * as Y from "yjs";
import { canEdit, documentAccess, pageLevels, refuseUpdate, type Workspace } from "./access.ts";
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
 *   opened), so access changes made since apply at once. Full access may change anything, and
 *   is accepted without decoding the update.
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
  const isNewPage = ref?.kind === "page" && !workspace.pages.some((p) => p.id === ref.id);
  const level = isNewPage ? null : documentAccess(workspace, personId, documentName, levels);
  if (level === "full") return null;
  const { touched, copy } = previewUpdate(doc, update);
  try {
    if (touched.size === 0) return null;
    if (level !== null) return asRefusal(refuseUpdate(level, touched));
    const meta = ref?.kind === "page" ? readMeta(ref.id, copy) : null;
    const placed = meta ? placementLevel(workspace, personId, meta) : "none";
    if (!canEdit(placed)) return "placement-refused";
    return asRefusal(refuseUpdate(placed, touched));
  } finally {
    copy.destroy();
  }
}

const asRefusal = (reason: string | null): Refusal | null => (reason === null ? null : isRefusal(reason) ? reason : "read-only");
