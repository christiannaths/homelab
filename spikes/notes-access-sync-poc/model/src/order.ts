import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

/**
 * Fractional-index sort keys: a new key can always be made between two others,
 * so inserting or moving an item writes only that item, which keeps concurrent
 * reorders from conflicting. Two clients can still pick the same key for the
 * same gap; callers break ties by id.
 */
export function compareOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function keyBetween(
  before: string | null,
  after: string | null,
): string {
  return generateKeyBetween(before || null, after || null);
}

/** Fresh keys for siblings whose existing keys are missing or tied, or for a batch appended after `after`. */
export function freshKeys(
  count: number,
  after: string | null = null,
): string[] {
  return generateNKeysBetween(after || null, null, count);
}

/** True when the keys strictly increase, so a key can be generated between any neighbours. */
export function keysAreUsable(keys: string[]): boolean {
  for (let i = 0; i < keys.length; i++) {
    if (!keys[i]) return false;
    if (i > 0 && compareOrder(keys[i - 1], keys[i]) >= 0) return false;
  }
  return true;
}
