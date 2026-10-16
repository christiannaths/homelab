import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  addProperty, addRow, addSelectOption, computeView, ensureDatabase, readRows, readSchema, readView,
  setCell, setSort, TITLE,
} from "./database";

function sampleDb() {
  const doc = new Y.Doc();
  ensureDatabase(doc);
  const num = addProperty(doc, "Points", "number");
  const status = addProperty(doc, "Status", "select");
  const todo = addSelectOption(doc, status, "Todo");
  const done = addSelectOption(doc, status, "Done");
  const r1 = addRow(doc, { [TITLE]: "Banana", [num]: 10, [status]: done });
  const r2 = addRow(doc, { [TITLE]: "apple", [num]: 2, [status]: todo });
  const r3 = addRow(doc, { [TITLE]: "Cherry" });
  return { doc, num, status, rows: [r1, r2, r3] };
}

const titles = (doc: Y.Doc, filter = "") =>
  computeView(readRows(doc), readSchema(doc), readView(doc), filter).map((r) => r.cells[TITLE]);

describe("database views", () => {
  it("keeps rows in creation order by default", () => {
    expect(titles(sampleDb().doc)).toEqual(["Banana", "apple", "Cherry"]);
  });

  it("sorts text case-insensitively and numbers numerically, with empty cells last", () => {
    const { doc, num } = sampleDb();
    setSort(doc, { propId: TITLE, dir: "asc" });
    expect(titles(doc)).toEqual(["apple", "Banana", "Cherry"]);
    setSort(doc, { propId: num, dir: "asc" });
    expect(titles(doc)).toEqual(["apple", "Banana", "Cherry"]);
    setSort(doc, { propId: num, dir: "desc" });
    expect(titles(doc)).toEqual(["Banana", "apple", "Cherry"]);
  });

  it("sorts select cells by option order, not name", () => {
    const { doc, status } = sampleDb();
    setSort(doc, { propId: status, dir: "asc" });
    expect(titles(doc)).toEqual(["apple", "Banana", "Cherry"]); // Todo, Done, (empty)
  });

  it("filters across all columns, including select option names", () => {
    const { doc } = sampleDb();
    expect(titles(doc, "done")).toEqual(["Banana"]);
    expect(titles(doc, "an")).toEqual(["Banana"]);
  });

  it("clearing a cell removes it", () => {
    const { doc, num, rows } = sampleDb();
    setCell(doc, rows[0], num, null);
    expect(readRows(doc).find((r) => r.id === rows[0])?.cells[num]).toBeUndefined();
  });

  it("merges concurrent edits to different cells of the same row", () => {
    const { doc: alice, num, status, rows } = sampleDb();
    const bob = new Y.Doc();
    Y.applyUpdate(bob, Y.encodeStateAsUpdate(alice));
    setCell(alice, rows[2], num, 7);
    const opt = readSchema(bob).find((p) => p.id === status)!.options[0].id;
    setCell(bob, rows[2], status, opt);
    Y.applyUpdate(bob, Y.encodeStateAsUpdate(alice));
    Y.applyUpdate(alice, Y.encodeStateAsUpdate(bob));
    const cells = readRows(alice).find((r) => r.id === rows[2])!.cells;
    expect(cells[num]).toBe(7);
    expect(cells[status]).toBe(opt);
  });

  it("even a double initialisation merges to a single title column", () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    ensureDatabase(a);
    ensureDatabase(b);
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    expect(readSchema(a).filter((p) => p.type === "title")).toHaveLength(1);
  });

  it("computes a sorted, filtered view of 5,000 rows quickly", () => {
    const doc = new Y.Doc();
    ensureDatabase(doc);
    const num = addProperty(doc, "Points", "number");
    doc.transact(() => {
      let last: string | null = null;
      for (let i = 0; i < 5000; i++) {
        const id = addRow(doc, { [TITLE]: `Row ${i}`, [num]: (i * 7919) % 1000 }, last);
        last = doc.getMap<Y.Map<unknown>>("rows").get(id)!.get("_order") as string;
      }
    });
    setSort(doc, { propId: num, dir: "desc" });
    const started = performance.now();
    const view = computeView(readRows(doc), readSchema(doc), readView(doc), "row 1");
    const ms = performance.now() - started;
    expect(view.length).toBeGreaterThan(1000);
    expect(ms).toBeLessThan(500);
  });
});
