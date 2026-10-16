import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  addProperty, addRow, createDatabase, databaseTable, readCells, readProperties, renameProperty, setCell, setView,
} from "./database.ts";
import { buildTree } from "./tree.ts";
import { privateSection, readMeta, renamePage, type PageDocs } from "./workspace.ts";

/** A device: one Y.Doc per page (rows included), and one per database's properties. */
class Device implements PageDocs {
  readonly docs = new Map<string, Y.Doc>();
  readonly schemas = new Map<string, Y.Doc>();
  get(id: string) {
    return this.docs.get(id);
  }
  create(id: string) {
    const doc = new Y.Doc();
    this.docs.set(id, doc);
    return doc;
  }
  doc(id: string) {
    return this.docs.get(id)!;
  }
  schema(databaseId: string) {
    if (!this.schemas.has(databaseId)) this.schemas.set(databaseId, new Y.Doc());
    return this.schemas.get(databaseId)!;
  }
  tree() {
    return buildTree([...this.docs].flatMap(([id, d]) => readMeta(id, d) ?? []));
  }
  /** The database as a table: its rows in view order, each as [title, ...cells by property name]. */
  table(databaseId: string) {
    return databaseTable(this, this.tree(), databaseId, this.schema(databaseId));
  }
}

function syncDocs(a: Map<string, Y.Doc>, b: Map<string, Y.Doc>) {
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    if (!a.has(id)) a.set(id, new Y.Doc());
    if (!b.has(id)) b.set(id, new Y.Doc());
    const x = a.get(id)!;
    const y = b.get(id)!;
    Y.applyUpdate(y, Y.encodeStateAsUpdate(x, Y.encodeStateVector(y)));
    Y.applyUpdate(x, Y.encodeStateAsUpdate(y, Y.encodeStateVector(x)));
  }
}

function sync(x: Device, y: Device) {
  syncDocs(x.docs, y.docs);
  syncDocs(x.schemas, y.schemas);
}

/** Max's "Chores" database with Points (number) and Done (checkbox), and two rows, on a laptop and a synced phone. */
function setup() {
  const laptop = new Device();
  const chores = createDatabase(laptop, laptop.tree(), { title: "Chores", section: privateSection("max") });
  const points = addProperty(laptop.schema(chores), "Points", "number");
  const done = addProperty(laptop.schema(chores), "Done", "checkbox");
  const dishes = addRow(laptop, laptop.tree(), chores, { title: "Dishes", cells: { [points]: 3 } });
  const bins = addRow(laptop, laptop.tree(), chores, { title: "Bins", cells: { [points]: 1, [done]: true } });
  const phone = new Device();
  sync(laptop, phone);
  return { laptop, phone, chores, points, done, dishes, bins };
}

describe("a database across documents", () => {
  it("shows its rows as a table, in row order, sorted and filtered by its view", () => {
    const { laptop, chores, points } = setup();
    expect(laptop.table(chores)).toEqual([
      { title: "Dishes", Points: 3, Done: undefined },
      { title: "Bins", Points: 1, Done: true },
    ]);
    setView(laptop.doc(chores), { sort: { propertyId: points, direction: "asc" } });
    expect(laptop.table(chores).map((r) => r.title)).toEqual(["Bins", "Dishes"]);
    setView(laptop.doc(chores), { filter: "dish" });
    expect(laptop.table(chores).map((r) => r.title)).toEqual(["Dishes"]);
  });
});

describe("concurrent edits to a database", () => {
  it("edits to different cells of the same row both survive", () => {
    const { laptop, phone, chores, points, done, dishes } = setup();
    setCell(laptop.doc(dishes), points, 5);
    setCell(phone.doc(dishes), done, true);
    sync(laptop, phone);
    expect(readCells(laptop.doc(dishes))).toEqual({ [points]: 5, [done]: true });
    expect(laptop.table(chores)).toEqual(phone.table(chores));
  });

  it("a rename of the row, a cell edit and a rename of the property all survive", () => {
    const { laptop, phone, chores, points, dishes } = setup();
    renamePage(laptop.doc(dishes), "Wash up");
    setCell(phone.doc(dishes), points, 4);
    renameProperty(phone.schema(chores), points, "Effort");
    sync(laptop, phone);
    expect(laptop.table(chores)[0]).toEqual({ title: "Wash up", Effort: 4, Done: undefined });
    expect(phone.table(chores)).toEqual(laptop.table(chores));
  });

  it("two edits to the same cell end with the same value everywhere", () => {
    const { laptop, phone, points, bins } = setup();
    setCell(laptop.doc(bins), points, 7);
    setCell(phone.doc(bins), points, 9);
    sync(laptop, phone);
    expect(readCells(laptop.doc(bins))).toEqual(readCells(phone.doc(bins)));
  });

  it("rows added on two devices at once are both kept", () => {
    const { laptop, phone, chores } = setup();
    addRow(laptop, laptop.tree(), chores, { title: "Laundry" });
    addRow(phone, phone.tree(), chores, { title: "Plants" });
    sync(laptop, phone);
    expect(laptop.table(chores).map((r) => r.title).sort()).toEqual(["Bins", "Dishes", "Laundry", "Plants"]);
    expect(readProperties(laptop.schema(chores))).toEqual(readProperties(phone.schema(chores)));
  });
});
