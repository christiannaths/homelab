import type { AccessLevel } from "./levels.ts";

/** The only section in this slice; teamspace sections come later (spec #130). */
export const PRIVATE_SECTION = "private";

/** Only `page` is used so far; databases and rows come later (ADR-NOTE-013). */
export type PageKind = "page";

/**
 * The access set on a page itself (its `access` map). An absent entry inherits from the parent.
 * - `people`: per person, an invite or an override of what they inherit; "none" hides the page
 *   and its subpages from them.
 * - `workspace`: general access for every member of the page's workspace.
 */
export interface PageAccess {
  people: Readonly<Record<string, AccessLevel>>;
  workspace?: AccessLevel;
}

/** A page as plain data: its document's `meta` fields and `access`, without its content. */
export interface Page {
  id: string;
  workspaceId: string;
  title: string;
  kind: PageKind;
  parentId: string | null;
  /** Only a top-level page's section counts; a subpage is in its top-level ancestor's. */
  section: string;
  /** A fractional-index key among its siblings (ADR-NOTE-006 rule 3). */
  order: string;
  createdAt: number;
  /** Set when the page itself was moved to the Trash; its subpages go with it without one. */
  deletedAt: number | null;
  access: PageAccess;
}

/**
 * A change to one page's document: the fields to write and the access entries to set. Fields left
 * out are untouched; `deletedAt: null` takes the page out of the Trash.
 */
export interface PagePatch {
  title?: string;
  parentId?: string | null;
  order?: string;
  deletedAt?: number | null;
  access?: Partial<PageAccess>;
}
