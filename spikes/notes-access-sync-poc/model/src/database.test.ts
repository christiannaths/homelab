import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  documentAccess,
  pageLevels,
  sidebarSections,
  type Workspace,
} from "./access.ts";
import {
  addProperty,
  addRow,
  createDatabase,
  renameProperty,
  setCell,
  setView,
} from "./database.ts";
import type { Person } from "./people.ts";
import { reviewUpdate } from "./review.ts";
import { buildTree, flattenVisible, type PageMeta } from "./tree.ts";
import {
  metaMap,
  pageDocName,
  privateSection,
  readMeta,
  renamePage,
  schemaDocName,
  setPersonAccess,
  type PageDocs,
} from "./workspace.ts";

const people: Person[] = [
  { id: "max", name: "Max", role: "member" },
  { id: "nia", name: "Nia", role: "member" },
  { id: "gus", name: "Gus", role: "guest" },
];
const page = (id: string, over: Partial<PageMeta> = {}): PageMeta => ({
  id,
  title: id,
  kind: "page",
  parentId: null,
  section: privateSection("max"),
  order: "a0",
  createdAt: 1,
  ...over,
});
const row = (id: string, over: Partial<PageMeta> = {}): PageMeta =>
  page(id, { kind: "row", parentId: "chores", ...over });

// Max's Private database "Chores", shared with Nia at Can edit content; one row, "Bins", also
// shared on its own with Gus at Can view.
const workspace: Workspace = {
  people,
  pages: [
    page("chores", {
      kind: "database",
      access: { people: { nia: "edit-content" } },
    }),
    row("dishes"),
    row("bins", { access: { people: { gus: "view" } } }),
  ],
};

describe("database access", () => {
  it("rows inherit the database page's access", () => {
    expect(Object.fromEntries(pageLevels(workspace, "nia"))).toEqual({
      chores: "edit-content",
      dishes: "edit-content",
      bins: "edit-content",
    });
    expect(Object.fromEntries(pageLevels(workspace, "max"))).toEqual({
      chores: "full",
      dishes: "full",
      bins: "full",
    });
  });

  it("a row shared on its own reaches only that row", () => {
    expect(Object.fromEntries(pageLevels(workspace, "gus"))).toEqual({
      bins: "view",
    });
  });

  it("the database's properties reach everyone who can open the database or any of its rows", () => {
    const schema = schemaDocName("chores");
    expect(documentAccess(workspace, "max", schema)).toBe("full");
    expect(documentAccess(workspace, "nia", schema)).toBe("edit-content");
    // Showing one row needs the property names and types, read-only.
    expect(documentAccess(workspace, "gus", schema)).toBe("view");
    expect(
      documentAccess(
        { ...workspace, pages: workspace.pages.filter((p) => p.id !== "bins") },
        "gus",
        schema,
      ),
    ).toBe("none");
  });

  it("rows aren't sidebar pages: they stay inside their database, unless the database is hidden", () => {
    const rows = (personId: string) => {
      const pages = [...pageLevels(workspace, personId).keys()].map((id) =>
        workspace.pages.find((p) => p.id === id)!,
      );
      const tree = buildTree(pages);
      const { shared, private: mine } = sidebarSections(tree, personId);
      return flattenVisible({ roots: [...shared, ...mine] }, () => true).map(
        (n) => n.page.id,
      );
    };
    expect(rows("nia")).toEqual(["chores"]);
    expect(rows("gus")).toEqual(["bins"]);
  });
});

/** An update a device makes to its own copy of the server's document. */
function edit(server: Y.Doc, change: (doc: Y.Doc) => void): Uint8Array {
  const device = new Y.Doc();
  Y.applyUpdate(device, Y.encodeStateAsUpdate(server));
  const before = Y.encodeStateVector(device);
  change(device);
  return Y.encodeStateAsUpdate(device, before);
}

/**
 * The server's copies of Max's Chores database (shared with Nia at Can edit content), its
 * properties and its Dishes row, plus a Bins row shared on its own with Gus at Can view.
 */
function serverDocs() {
  const docs = new Map<string, Y.Doc>();
  const store: PageDocs = {
    get: (id) => docs.get(id),
    create: (id) => (docs.set(id, new Y.Doc()), docs.get(id)!),
  };
  const tree = () => buildTree([...docs].map(([id, d]) => readMeta(id, d)!));
  const chores = createDatabase(store, tree(), {
    title: "Chores",
    section: privateSection("max"),
  });
  const schema = new Y.Doc();
  const points = addProperty(schema, "Points", "number");
  const dishes = addRow(store, tree(), chores, { title: "Dishes" });
  const ws: Workspace = {
    people,
    pages: [
      ...[...docs]
        .map(([id, d]) => readMeta(id, d)!)
        .map((p) =>
          p.id === chores
            ? { ...p, access: { people: { nia: "edit-content" as const } } }
            : p,
        ),
      row("bins", { parentId: chores, access: { people: { gus: "view" } } }),
    ],
  };
  const review = (
    personId: string,
    name: string,
    doc: Y.Doc,
    change: (d: Y.Doc) => void,
  ) => reviewUpdate(ws, personId, name, doc, edit(doc, change));
  return { ws, docs, store, tree, chores, schema, points, dishes, review };
}

describe("Can edit content", () => {
  it("may add rows and edit their values", () => {
    const { ws, docs, store, tree, chores, points, dishes, review } =
      serverDocs();
    const dishesDoc = docs.get(dishes)!;
    expect(
      review("nia", pageDocName(dishes), dishesDoc, (d) =>
        setCell(d, points, 4),
      ),
    ).toBeNull();
    expect(
      review("nia", pageDocName(dishes), dishesDoc, (d) =>
        renamePage(d, "Wash up"),
      ),
    ).toBeNull();
    const draft = new Y.Doc();
    const id = addRow(
      { get: (pageId) => store.get(pageId), create: () => draft },
      tree(),
      chores,
      {
        title: "Laundry",
        cells: { [points]: 2 },
      },
    );
    expect(
      reviewUpdate(
        ws,
        "nia",
        pageDocName(id),
        new Y.Doc(),
        Y.encodeStateAsUpdate(draft),
      ),
    ).toBeNull();
  });

  it("may not change the database's properties, views, title or access", () => {
    const { docs, chores, schema, points, dishes, review } = serverDocs();
    const db = docs.get(chores)!;
    expect(
      review("nia", pageDocName(chores), db, (d) =>
        setView(d, { filter: "x" }),
      ),
    ).toBe("structure-refused");
    expect(
      review("nia", pageDocName(chores), db, (d) => renamePage(d, "Jobs")),
    ).toBe("structure-refused");
    expect(
      review("nia", schemaDocName(chores), schema, (d) =>
        renameProperty(d, points, "Effort"),
      ),
    ).toBe("structure-refused");
    expect(
      review("nia", schemaDocName(chores), schema, (d) =>
        addProperty(d, "Due", "text"),
      ),
    ).toBe("structure-refused");
    expect(
      review("nia", pageDocName(dishes), docs.get(dishes)!, (d) =>
        setPersonAccess(d, "gus", "view"),
      ),
    ).toBe("access-change-refused");
  });

  it("nobody turns a row into a page, which would take it out of its database", () => {
    const { docs, dishes, review } = serverDocs();
    for (const person of ["nia", "max"]) {
      expect(
        review(person, pageDocName(dishes), docs.get(dishes)!, (d) =>
          metaMap(d).set("kind", "page"),
        ),
      ).toBe("placement-refused");
    }
  });

  it("Can view refuses every change; Full access changes the structure", () => {
    const { chores, schema, points, review } = serverDocs();
    expect(
      review("gus", pageDocName("bins"), new Y.Doc(), (d) =>
        setCell(d, points, 1),
      ),
    ).toBe("read-only");
    expect(
      review("gus", schemaDocName(chores), schema, (d) =>
        renameProperty(d, points, "P"),
      ),
    ).toBe("read-only");
    expect(
      review("max", schemaDocName(chores), schema, (d) =>
        addProperty(d, "Due", "text"),
      ),
    ).toBeNull();
  });
});
