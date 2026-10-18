import type * as Y from "yjs";

/** The string at `key`, or `fallback` when it is missing or not a string. */
export function stringField(
  m: Y.Map<unknown> | undefined,
  key: string,
  fallback: string,
): string {
  const value = m?.get(key);
  return typeof value === "string" ? value : fallback;
}

/** The number at `key`, or `fallback` when it is missing or not a number. */
export function numberField<F extends number | undefined>(
  m: Y.Map<unknown> | undefined,
  key: string,
  fallback: F,
): number | F {
  const value = m?.get(key);
  return typeof value === "number" ? value : fallback;
}
