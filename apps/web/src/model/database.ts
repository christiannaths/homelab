import * as Y from "yjs";
import { compareOrder, keyBetween } from "./order";

/**
 * A database is one Y.Doc:
 *   schema: Y.Map<propId, Y.Map{ name, type, order, options: Y.Array<SelectOption> }>
 *   rows:   Y.Map<rowId,  Y.Map{ [propId]: value, _order, _createdAt, _hasBody }>
 *   views:  Y.Map<viewId, Y.Map{ sort }>
 * Every row's cells live in this one doc, so views are computed locally with no server.
 * Each row is its own Y.Map, so concurrent edits to different cells merge; edits to the
 * same cell resolve last-writer-wins. A row's page body is a separate doc (page:<rowId>),
 * which is only synced once it has content (_hasBody), so a 5,000-row table doesn't mean
 * 5,000 docs to sync.
 */

export type PropType = "title" | "text" | "number" | "select" | "checkbox" | "date";
export const PROP_TYPES: PropType[] = ["text", "number", "select", "checkbox", "date"];
export const TITLE = "title";

export interface SelectOption {
  id: string;
  name: string;
  color: string;
}

export interface Property {
  id: string;
  name: string;
  type: PropType;
  order: string;
  options: SelectOption[];
}

export type CellValue = string | number | boolean | null;

export interface Row {
  id: string;
  order: string;
  createdAt: number;
  hasBody: boolean;
  cells: Record<string, CellValue>;
}

export interface SortSpec {
  propId: string;
  dir: "asc" | "desc";
}

export interface ViewConfig {
  sort: SortSpec | null;
}

const OPTION_COLORS = ["#e3f2fd", "#e8f5e9", "#fff3e0", "#fce4ec", "#f3e5f5", "#e0f7fa", "#fffde7"];

export const schemaMap = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>("schema");
export const rowsMap = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>("rows");
export const viewsMap = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>("views");
export const DEFAULT_VIEW = "default";

/**
 * Creates the title property and default view. Call it only on the device that
 * creates the database. On a device that hasn't synced yet, the local doc looks
 * empty, and a fresh title map written there would compete with the real one
 * (Y.Map keys are last-writer-wins) and could undo a rename.
 */
export function ensureDatabase(doc: Y.Doc): void {
  doc.transact(() => {
    if (!schemaMap(doc).has(TITLE)) {
      const m = new Y.Map<unknown>();
      m.set("name", "Name");
      m.set("type", "title");
      m.set("order", "a0");
      m.set("options", new Y.Array<SelectOption>());
      schemaMap(doc).set(TITLE, m);
    }
    if (!viewsMap(doc).has(DEFAULT_VIEW)) {
      const v = new Y.Map<unknown>();
      v.set("sort", null);
      viewsMap(doc).set(DEFAULT_VIEW, v);
    }
  });
}

export function readSchema(doc: Y.Doc): Property[] {
  const props: Property[] = [];
  schemaMap(doc).forEach((m, id) => {
    if (m.get("deletedAt")) return;
    props.push({
      id,
      name: (m.get("name") as string) ?? "",
      type: (m.get("type") as PropType) ?? "text",
      order: (m.get("order") as string) ?? "",
      options: ((m.get("options") as Y.Array<SelectOption> | undefined)?.toArray() ?? []),
    });
  });
  return props.sort((a, b) => compareOrder(a.order, b.order) || (a.id < b.id ? -1 : 1));
}

export function readRows(doc: Y.Doc): Row[] {
  const rows: Row[] = [];
  rowsMap(doc).forEach((m, id) => {
    const cells: Record<string, CellValue> = {};
    let order = "";
    let createdAt = 0;
    let hasBody = false;
    m.forEach((v, k) => {
      if (k === "_order") order = v as string;
      else if (k === "_createdAt") createdAt = v as number;
      else if (k === "_hasBody") hasBody = !!v;
      else cells[k] = v as CellValue;
    });
    rows.push({ id, order, createdAt, hasBody, cells });
  });
  return rows;
}

export function readView(doc: Y.Doc, viewId = DEFAULT_VIEW): ViewConfig {
  const v = viewsMap(doc).get(viewId);
  return { sort: (v?.get("sort") as SortSpec | null) ?? null };
}

export function setSort(doc: Y.Doc, sort: SortSpec | null, viewId = DEFAULT_VIEW): void {
  viewsMap(doc).get(viewId)?.set("sort", sort);
}

export function addProperty(doc: Y.Doc, name: string, type: PropType): string {
  const id = crypto.randomUUID();
  const last = readSchema(doc).at(-1)?.order ?? null;
  doc.transact(() => {
    const m = new Y.Map<unknown>();
    m.set("name", name);
    m.set("type", type);
    m.set("order", keyBetween(last, null));
    m.set("options", new Y.Array<SelectOption>());
    schemaMap(doc).set(id, m);
  });
  return id;
}

export function renameProperty(doc: Y.Doc, propId: string, name: string): void {
  schemaMap(doc).get(propId)?.set("name", name);
}

export function deleteProperty(doc: Y.Doc, propId: string): void {
  // Soft delete: cells keep their values, so an undo or a concurrent edit loses nothing.
  if (propId !== TITLE) schemaMap(doc).get(propId)?.set("deletedAt", Date.now());
}

export function addSelectOption(doc: Y.Doc, propId: string, name: string): string {
  const options = schemaMap(doc).get(propId)?.get("options") as Y.Array<SelectOption> | undefined;
  const id = crypto.randomUUID();
  options?.push([{ id, name, color: OPTION_COLORS[(options.length ?? 0) % OPTION_COLORS.length] }]);
  return id;
}

/** Rows are created with order keys after the current last row. */
export function addRow(doc: Y.Doc, cells: Record<string, CellValue> = {}, afterOrder?: string | null): string {
  const id = crypto.randomUUID();
  const last = afterOrder !== undefined ? afterOrder : lastRowOrder(doc);
  doc.transact(() => {
    const m = new Y.Map<unknown>();
    m.set("_order", keyBetween(last, null));
    m.set("_createdAt", Date.now());
    for (const [k, v] of Object.entries(cells)) if (v !== null && v !== "") m.set(k, v);
    rowsMap(doc).set(id, m);
  });
  return id;
}

function lastRowOrder(doc: Y.Doc): string | null {
  let last: string | null = null;
  rowsMap(doc).forEach((m) => {
    const o = m.get("_order") as string;
    if (o && (last === null || compareOrder(o, last) > 0)) last = o;
  });
  return last;
}

export function setCell(doc: Y.Doc, rowId: string, propId: string, value: CellValue): void {
  const row = rowsMap(doc).get(rowId);
  if (!row) return;
  if (value === null || value === "") row.delete(propId);
  else row.set(propId, value);
}

export function markRowHasBody(doc: Y.Doc, rowId: string): void {
  const row = rowsMap(doc).get(rowId);
  if (row && !row.get("_hasBody")) row.set("_hasBody", true);
}

export function deleteRow(doc: Y.Doc, rowId: string): void {
  rowsMap(doc).delete(rowId);
}

// ---- Views ----

export function cellText(prop: Property, value: CellValue | undefined): string {
  if (value === undefined || value === null) return "";
  if (prop.type === "select") return prop.options.find((o) => o.id === value)?.name ?? "";
  if (prop.type === "checkbox") return value ? "Yes" : "";
  return String(value);
}

function compareCells(prop: Property, a: CellValue | undefined, b: CellValue | undefined): number {
  // Empty cells sort last in both directions, like Notion.
  const aEmpty = a === undefined || a === null || a === "";
  const bEmpty = b === undefined || b === null || b === "";
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? Infinity : -Infinity;
  switch (prop.type) {
    case "number":
      return (a as number) - (b as number);
    case "checkbox":
      return Number(a) - Number(b);
    case "select": {
      // Select options sort in the order they were defined, not alphabetically.
      const ia = prop.options.findIndex((o) => o.id === a);
      const ib = prop.options.findIndex((o) => o.id === b);
      return ia - ib;
    }
    default:
      // Dates are stored as YYYY-MM-DD, so string order is date order.
      return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  }
}

export function computeView(rows: Row[], schema: Property[], view: ViewConfig, filter = ""): Row[] {
  let out = rows;
  const q = filter.trim().toLowerCase();
  if (q) {
    out = out.filter((r) => schema.some((p) => cellText(p, r.cells[p.id]).toLowerCase().includes(q)));
  }
  const byOrder = (a: Row, b: Row) => compareOrder(a.order, b.order) || a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1);
  const sortProp = view.sort && schema.find((p) => p.id === view.sort!.propId);
  if (sortProp) {
    const dir = view.sort!.dir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      const c = compareCells(sortProp, a.cells[sortProp.id], b.cells[sortProp.id]);
      if (c === Infinity || c === -Infinity) return c > 0 ? 1 : -1; // empties last regardless of dir
      return c * dir || byOrder(a, b);
    });
  }
  return [...out].sort(byOrder);
}
