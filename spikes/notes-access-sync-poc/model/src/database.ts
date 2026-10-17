import * as Y from "yjs";
import { compareOrder, keyBetween } from "./order.ts";
import { comparePages, type PageMeta, type Tree } from "./tree.ts";
import { createPage, type PageDocs } from "./workspace.ts";

/**
 * Databases, with rows as pages (#20). A database is split across documents by who may receive
 * each part, because a single row can be shared on its own:
 * - **`page:<databaseId>`** (kind "database"): the database page's `meta`, `access` and `content`,
 *   plus its **views** (`views` map: view id → sort and filter). Only people who can open the
 *   database receive it, so view settings never reach someone given a single row.
 * - **`schema:<databaseId>`**: its **properties** (`properties` map: property id → name, type,
 *   order). Everyone who can open the database or any of its rows receives it, because showing a
 *   row needs the property names and types (`schemaAccess`).
 * - **`page:<rowId>`** (kind "row", `parentId` = the database): one document per row, holding its
 *   `meta` (the title is the row's Name, `order` its place in the table), its **cells** (`cells`
 *   map: property id → value) and its page body (`content`). A row inherits the database page's
 *   access like any subpage, and can be shared on its own like any page.
 * Adding a row writes only the new row's document, and each cell is its own key, so concurrent
 * edits to different cells (or rows) merge (ADR-NOTE-006 rule 4).
 */

/** The property types this spike keeps: enough to test with. The title (Name) is the row page's title. */
export type PropertyType = "text" | "number" | "checkbox";
export const PROPERTY_TYPES: readonly PropertyType[] = ["text", "number", "checkbox"];

export interface Property {
  id: string;
  name: string;
  type: PropertyType;
  order: string;
}

export type CellValue = string | number | boolean;

export interface ViewSettings {
  sort: { propertyId: string; direction: "asc" | "desc" } | null;
  filter: string;
}

/** A database's only view in this spike: a plain table. */
export const DEFAULT_VIEW = "table";

export const propertiesMap = (schema: Y.Doc) => schema.getMap<Y.Map<unknown>>("properties");
export const viewsMap = (database: Y.Doc) => database.getMap<Y.Map<unknown>>("views");
export const cellsMap = (row: Y.Doc) => row.getMap<unknown>("cells");

/**
 * Creates a database page, with its default view, in a document of its own and returns its id.
 * The view is written once, by the creating device (ADR-NOTE-006 rule 2). Properties are added to its
 * `schema:<id>` document with `addProperty`.
 */
export function createDatabase(
  docs: PageDocs,
  tree: Tree,
  opts: { parentId?: string | null; section?: string; title?: string } = {},
): string {
  const { id, doc } = createPageDoc(docs, tree, { ...opts, kind: "database" });
  doc.transact(() => {
    const view = new Y.Map<unknown>();
    view.set("sort", null);
    view.set("filter", "");
    viewsMap(doc).set(DEFAULT_VIEW, view);
  });
  return id;
}

/** `createPage`, also returning the document it created (`docs` may not hand it back from `get`). */
function createPageDoc(docs: PageDocs, tree: Tree, opts: Parameters<typeof createPage>[2]): { id: string; doc: Y.Doc } {
  let doc!: Y.Doc;
  const id = createPage({ get: (pageId) => docs.get(pageId), create: (pageId) => (doc = docs.create(pageId)) }, tree, opts);
  return { id, doc };
}

export function addProperty(schema: Y.Doc, name: string, type: PropertyType): string {
  const id = crypto.randomUUID();
  const last = readProperties(schema).at(-1)?.order ?? null;
  schema.transact(() => {
    const m = new Y.Map<unknown>();
    m.set("name", name);
    m.set("type", type);
    m.set("order", keyBetween(last, null));
    propertiesMap(schema).set(id, m);
  });
  return id;
}

export function renameProperty(schema: Y.Doc, propertyId: string, name: string): void {
  propertiesMap(schema).get(propertyId)?.set("name", name);
}

export function readProperties(schema: Y.Doc): Property[] {
  const out: Property[] = [];
  propertiesMap(schema).forEach((m, id) => {
    const type = m.get("type") as PropertyType;
    out.push({
      id,
      name: (m.get("name") as string) ?? "",
      type: PROPERTY_TYPES.includes(type) ? type : "text",
      order: (m.get("order") as string) ?? "",
    });
  });
  return out.sort((a, b) => compareOrder(a.order, b.order) || (a.id < b.id ? -1 : 1));
}

/** Changes the database's view settings: one key per setting, so a sort and a filter set at once both stick. */
export function setView(database: Y.Doc, changes: Partial<ViewSettings>, viewId = DEFAULT_VIEW): void {
  const view = viewsMap(database).get(viewId);
  if (!view) return;
  database.transact(() => {
    for (const [key, value] of Object.entries(changes)) view.set(key, value);
  });
}

export function readView(database: Y.Doc, viewId = DEFAULT_VIEW): ViewSettings {
  const view = viewsMap(database).get(viewId);
  return {
    sort: (view?.get("sort") as ViewSettings["sort"]) ?? null,
    filter: (view?.get("filter") as string) ?? "",
  };
}

/**
 * Adds a row to a database the device holds, in a document of its own, and returns its id. The
 * row's meta, title and cells reach the server as its first update.
 */
export function addRow(
  docs: PageDocs,
  tree: Tree,
  databaseId: string,
  opts: { title?: string; cells?: Record<string, CellValue> } = {},
): string {
  const { id, doc } = createPageDoc(docs, tree, { parentId: databaseId, kind: "row", title: opts.title ?? "" });
  doc.transact(() => {
    for (const [propertyId, value] of Object.entries(opts.cells ?? {})) setCell(doc, propertyId, value);
  });
  return id;
}

/** Sets a row's cell; null or "" clears it. */
export function setCell(row: Y.Doc, propertyId: string, value: CellValue | null): void {
  if (value === null || value === "") cellsMap(row).delete(propertyId);
  else cellsMap(row).set(propertyId, value);
}

export function readCells(row: Y.Doc): Record<string, CellValue> {
  return cellsMap(row).toJSON() as Record<string, CellValue>;
}

/** One line of a database table: the row's title, and its cells by property name. */
export type TableRow = { title: string } & Record<string, CellValue | string | undefined>;

/**
 * The database's rows that the device holds, as its table view shows them: in row order, then
 * sorted and filtered by the view (when the device holds the database page; a device given only
 * some rows has no view settings, so it shows them in row order).
 */
export function databaseTable(docs: PageDocs, tree: Tree, databaseId: string, schema: Y.Doc): TableRow[] {
  const properties = readProperties(schema);
  const database = docs.get(databaseId);
  const view = database ? readView(database) : { sort: null, filter: "" };
  const rows = (tree.byId.get(databaseId)?.children ?? [])
    .filter((n) => n.page.kind === "row")
    .map((n) => ({ page: n.page, cells: readCells(docs.get(n.page.id)!) }));
  const q = view.filter.trim().toLowerCase();
  const matches = (r: { page: PageMeta; cells: Record<string, CellValue> }) =>
    !q || [r.page.title, ...Object.values(r.cells)].some((v) => String(v).toLowerCase().includes(q));
  const sortBy = view.sort && properties.find((p) => p.id === view.sort!.propertyId);
  const shown = rows.filter(matches).sort((a, b) => {
    const x = sortBy ? a.cells[sortBy.id] : undefined;
    const y = sortBy ? b.cells[sortBy.id] : undefined;
    // Empty cells go last in both directions, as in Notion.
    if ((x === undefined) !== (y === undefined)) return x === undefined ? 1 : -1;
    const c = x !== undefined && y !== undefined ? compareCells(x, y) : 0;
    return (view.sort?.direction === "desc" ? -c : c) || comparePages(a.page, b.page);
  });
  return shown.map((r) => {
    const line: TableRow = { title: r.page.title };
    for (const p of properties) line[p.name] = r.cells[p.id];
    return line;
  });
}

function compareCells(a: CellValue, b: CellValue): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}
