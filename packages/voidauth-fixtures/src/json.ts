// VoidAuth's JSON API is not typed, so each body is checked for the shape a step reads from it.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The objects of a JSON array body, failing when it is something else. */
export function records(body: unknown): Record<string, unknown>[] {
  if (!Array.isArray(body) || !body.every(isRecord))
    throw new Error(`Not a list of objects: ${JSON.stringify(body)}`);
  return body;
}

/** A string field of a JSON body, failing when the body has another shape. */
export function stringField(body: unknown, key: string): string {
  const value = isRecord(body) ? body[key] : undefined;
  if (typeof value !== "string")
    throw new Error(`No string ${key} in ${JSON.stringify(body)}`);
  return value;
}
