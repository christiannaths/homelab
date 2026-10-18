/** Notion's page access levels (ADR-NOTE-012), most permissive first. */
export const ACCESS_LEVELS = [
  "full",
  "edit",
  "edit-content",
  "comment",
  "view",
  "none",
] as const;

export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export function isAccessLevel(value: unknown): value is AccessLevel {
  return (
    typeof value === "string" &&
    (ACCESS_LEVELS as readonly string[]).includes(value)
  );
}

/** The more permissive of two levels: when access comes from several sources, the most permissive wins. */
export function mostPermissive(a: AccessLevel, b: AccessLevel): AccessLevel {
  return ACCESS_LEVELS.indexOf(a) <= ACCESS_LEVELS.indexOf(b) ? a : b;
}

/** True if `level` allows at least what `required` allows. */
export function atLeast(level: AccessLevel, required: AccessLevel): boolean {
  return ACCESS_LEVELS.indexOf(level) <= ACCESS_LEVELS.indexOf(required);
}

/**
 * The access set on one page: what it changes about the access it inherits from its parent (or,
 * at the top level, from its section). Every key is optional, and an absent key inherits:
 * - `people`: per person, an invite or an override of what they inherit. A higher level expands,
 *   a lower one restricts ("none" hides the page and its subpages from them). Deleting the entry
 *   is Restore inherited access.
 * - `workspace`: general access for everyone in the workspace (members and owners, never guests).
 *   "none" is "Only people invited".
 *
 * Stored in the page's own document (the `access` map, one key per entry: `person:<id>` and
 * `workspace`), so it reaches exactly the people who can open the page, and concurrent changes to
 * different entries merge (ADR-NOTE-006 rule 4).
 */
export interface PageAccess {
  people?: Readonly<Record<string, AccessLevel>>;
  workspace?: AccessLevel;
  /** In a teamspace: the level its members get here and below, instead of the teamspace's default (#17). */
  teamspace?: AccessLevel;
}
