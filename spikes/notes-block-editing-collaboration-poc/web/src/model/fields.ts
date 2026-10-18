import type * as Y from "yjs";

// Yjs maps hold whatever any peer wrote, so each read checks the type and falls
// back to the default when the value is missing or has the wrong type.

export function stringField(
  m: Y.Map<unknown>,
  key: string,
  fallback: string,
): string {
  const value = m.get(key);
  return typeof value === "string" ? value : fallback;
}

export function numberField(
  m: Y.Map<unknown>,
  key: string,
  fallback: number,
): number {
  const value = m.get(key);
  return typeof value === "number" ? value : fallback;
}

export function optionalNumberField(
  m: Y.Map<unknown>,
  key: string,
): number | undefined {
  const value = m.get(key);
  return typeof value === "number" ? value : undefined;
}

export function nullableStringField(
  m: Y.Map<unknown>,
  key: string,
): string | null {
  const value = m.get(key);
  return typeof value === "string" ? value : null;
}
