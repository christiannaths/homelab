import { generateKeyBetween } from "fractional-indexing";

/** Plain code-unit order, the order fractional-index keys are made for (not `localeCompare`). */
export function compareOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function keyAfter(key: string): string | null {
  try {
    return generateKeyBetween(key || null, null);
  } catch {
    return null;
  }
}

/**
 * A key that sorts after every key in `keys`, so only the new page is written and concurrent
 * additions don't conflict (ADR-NOTE-006 rule 3). Keys `fractional-indexing` rejects (a page
 * written by a faulty client) are passed over: the new page goes after the last usable one.
 */
export function newLastOrder(keys: readonly string[]): string {
  for (const key of keys.toSorted(compareOrder).toReversed()) {
    const after = keyAfter(key);
    if (after !== null) return after;
  }
  return generateKeyBetween(null, null);
}
