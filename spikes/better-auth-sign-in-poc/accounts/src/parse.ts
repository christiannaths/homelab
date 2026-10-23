// Narrows what arrives from outside (form fields, JSON bodies, SQLite rows) to the shapes the
// service uses.

/** A group name: a lowercase slug, so a list of them can be stored and sent comma-separated. */
const GROUP = /^[a-z0-9_-]+$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** A form field's text; empty for a missing field or a file. */
export function formText(form: Record<string, unknown>, name: string): string {
  const value = form[name];
  return typeof value === "string" ? value : "";
}

/** A list of group names, or undefined when it isn't one. */
export function groupList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const groups: string[] = [];
  for (const item of value as unknown[]) {
    if (typeof item !== "string" || !GROUP.test(item)) return undefined;
    groups.push(item);
  }
  return groups;
}

export function optionalString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}
