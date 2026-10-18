// Checks on parsed JSON from VoidAuth, the app and their callers. Each throws on an unexpected
// shape, so a changed response fails at the point it is read.

export type JsonObject = Record<string, unknown>;

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null;
}

export function jsonObject(value: unknown): JsonObject {
  if (!isJsonObject(value))
    throw new Error(`Expected a JSON object, got ${JSON.stringify(value)}`);
  return value;
}

export function stringField(value: unknown, key: string): string {
  const field = jsonObject(value)[key];
  if (typeof field !== "string")
    throw new Error(
      `Expected "${key}" to be a string, got ${JSON.stringify(field)}`,
    );
  return field;
}

export function nullableStringField(
  value: unknown,
  key: string,
): string | null {
  const field = jsonObject(value)[key];
  return field === null ? null : stringField(value, key);
}

export function arrayField(value: unknown, key: string): unknown[] {
  const field = jsonObject(value)[key];
  if (!Array.isArray(field))
    throw new Error(
      `Expected "${key}" to be an array, got ${JSON.stringify(field)}`,
    );
  return field;
}
