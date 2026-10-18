// node:sqlite types every column as any SQL value, so each query's row is checked against the
// columns it selects. A mismatch means the schema and the query disagree, which is a bug.
type Row = Record<string, unknown>;

export function text(row: Row, column: string): string {
  const value = row[column];
  if (typeof value !== "string")
    throw new Error(`Column ${column} is not text`);
  return value;
}

export function nullableText(row: Row, column: string): string | null {
  return row[column] === null ? null : text(row, column);
}

export function integer(row: Row, column: string): number {
  const value = row[column];
  if (typeof value !== "number")
    throw new Error(`Column ${column} is not an integer`);
  return value;
}

export function blob(row: Row, column: string): Uint8Array {
  const value = row[column];
  if (!(value instanceof Uint8Array))
    throw new Error(`Column ${column} is not a blob`);
  return value;
}
