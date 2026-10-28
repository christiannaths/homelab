/** Page access levels (ADR-NOTE-012), most permissive first. */
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
  return ACCESS_LEVELS.some((level) => level === value);
}

/** True if `level` allows at least what `required` allows. */
export function atLeast(level: AccessLevel, required: AccessLevel): boolean {
  return ACCESS_LEVELS.indexOf(level) <= ACCESS_LEVELS.indexOf(required);
}

/** When access comes from several sources, the most permissive wins (ADR-NOTE-012). */
export function mostPermissive(a: AccessLevel, b: AccessLevel): AccessLevel {
  return atLeast(a, b) ? a : b;
}

export const canShare = (level: AccessLevel): boolean => atLeast(level, "full");

export const canEdit = (level: AccessLevel): boolean => atLeast(level, "edit");

export const canView = (level: AccessLevel): boolean => atLeast(level, "view");
