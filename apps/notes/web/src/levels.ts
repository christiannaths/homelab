import { canEdit, type AccessLevel } from "@homelab/notes-model";

/**
 * Whether to offer changes to page `id` that need Can edit. A page the index doesn't list yet was
 * made on this device, by this person, so it is theirs at Full access; the server reviews every
 * change anyway (ADR-NOTE-010).
 */
export function canChange(
  levels: ReadonlyMap<string, AccessLevel>,
  id: string,
): boolean {
  const level = levels.get(id);
  return level === undefined || canEdit(level);
}
