import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createPage, movePage, readPages, restorePage, trashPage } from "./workspace.ts";
import { buildTree, flattenVisible, type PageMeta } from "./tree.ts";

const page = (id: string, parentId: string | null, order = "a0", extra: Partial<PageMeta> = {}): PageMeta => ({
  id, title: id, kind: "page", parentId, order, createdAt: 0, ...extra,
});
const shape = (pages: PageMeta[]) =>
  flattenVisible(buildTree(pages), () => true).map((n) => `${"  ".repeat(n.depth)}${n.page.id}`);
const tree = (doc: Y.Doc) => buildTree(readPages(doc));

describe("buildTree", () => {
  it("nests pages and sorts siblings by order key", () => {
    expect(shape([page("b", null, "a1"), page("a", null, "a0"), page("c", "a", "a0")])).toEqual(["a", "  c", "b"]);
  });

  it("puts pages with a missing parent, or a database parent, at the top level", () => {
    const pages = [page("db", null, "a0", { kind: "database" }), page("x", "db", "a1"), page("y", "gone", "a2")];
    expect(shape(pages)).toEqual(["db", "x", "y"]);
  });

  it("breaks a cycle at its smallest id, whatever order the pages are listed in", () => {
    const pages = [page("b", "c"), page("c", "a"), page("a", "b"), page("d", "b")];
    const expected = ["a", "  c", "    b", "      d"];
    expect(shape(pages)).toEqual(expected);
    expect(shape([...pages].reverse())).toEqual(expected);
  });

  it("hides the subtree of a trashed page and lists only the trashed page itself in trash", () => {
    const t = buildTree([page("a", null), page("b", "a", "a0", { deletedAt: 5 }), page("c", "b")]);
    expect([...t.byId.keys()]).toEqual(["a"]);
    expect(t.trash.map((p) => p.id)).toEqual(["b"]);
  });
});

describe("workspace operations", () => {
  it("creates pages in order and moves them between positions and parents", () => {
    const doc = new Y.Doc();
    const a = createPage(doc, tree(doc), { title: "a" });
    const b = createPage(doc, tree(doc), { title: "b" });
    const c = createPage(doc, tree(doc), { title: "c" });
    const titles = () => flattenVisible(tree(doc), () => true).map((n) => "  ".repeat(n.depth) + n.page.title);
    expect(titles()).toEqual(["a", "b", "c"]);

    expect(movePage(doc, tree(doc), c, null, 0)).toBe(true);
    expect(titles()).toEqual(["c", "a", "b"]);

    expect(movePage(doc, tree(doc), b, a, 0)).toBe(true);
    expect(titles()).toEqual(["c", "a", "  b"]);
  });

  it("refuses to move a page into its own subtree or into a database", () => {
    const doc = new Y.Doc();
    const a = createPage(doc, tree(doc));
    const b = createPage(doc, tree(doc), { parentId: a });
    const db = createPage(doc, tree(doc), { kind: "database" });
    expect(movePage(doc, tree(doc), a, b, 0)).toBe(false);
    expect(movePage(doc, tree(doc), a, a, 0)).toBe(false);
    expect(movePage(doc, tree(doc), a, db, 0)).toBe(false);
  });

  it("renumbers siblings whose order keys are missing (pages from spike 1)", () => {
    const doc = new Y.Doc();
    for (const id of ["x", "y"]) {
      const m = new Y.Map<unknown>();
      m.set("title", id);
      m.set("createdAt", id === "x" ? 1 : 2);
      doc.getMap("pages").set(id, m);
    }
    const z = createPage(doc, tree(doc), { title: "z" });
    movePage(doc, tree(doc), z, null, 1);
    expect(flattenVisible(tree(doc), () => true).map((n) => n.page.title)).toEqual(["x", "z", "y"]);
  });

  it("restores a trashed page to the top level if its parent is still trashed", () => {
    const doc = new Y.Doc();
    const a = createPage(doc, tree(doc));
    const b = createPage(doc, tree(doc), { parentId: a });
    trashPage(doc, b);
    trashPage(doc, a);
    restorePage(doc, tree(doc), b);
    const t = tree(doc);
    expect(t.byId.get(b)?.parentId).toBeNull();
    expect(t.byId.has(a)).toBe(false);
  });
});

describe("concurrent edits (two devices, offline, then synced)", () => {
  const sync = (x: Y.Doc, y: Y.Doc) => {
    Y.applyUpdate(y, Y.encodeStateAsUpdate(x, Y.encodeStateVector(y)));
    Y.applyUpdate(x, Y.encodeStateAsUpdate(y, Y.encodeStateVector(x)));
  };

  it("A-under-B on one device and B-under-A on the other converge to the same acyclic tree", () => {
    const alice = new Y.Doc();
    const bob = new Y.Doc();
    const a = createPage(alice, tree(alice), { title: "A" });
    const b = createPage(alice, tree(alice), { title: "B" });
    sync(alice, bob);

    expect(movePage(alice, tree(alice), a, b, 0)).toBe(true);
    expect(movePage(bob, tree(bob), b, a, 0)).toBe(true);
    sync(alice, bob);

    const sa = flattenVisible(tree(alice), () => true).map((n) => `${n.depth}:${n.page.title}`);
    const sb = flattenVisible(tree(bob), () => true).map((n) => `${n.depth}:${n.page.title}`);
    expect(sa).toEqual(sb);
    expect(sa).toHaveLength(2); // both pages still visible, one nested under the other
    expect(sa[0].startsWith("0:")).toBe(true);
    expect(sa[1].startsWith("1:")).toBe(true);
  });

  it("concurrent inserts at the same position keep both pages, in the same order everywhere", () => {
    const alice = new Y.Doc();
    const bob = new Y.Doc();
    createPage(alice, tree(alice), { title: "first" });
    sync(alice, bob);
    createPage(alice, tree(alice), { title: "from alice" });
    createPage(bob, tree(bob), { title: "from bob" });
    sync(alice, bob);
    const titles = (d: Y.Doc) => flattenVisible(tree(d), () => true).map((n) => n.page.title);
    expect(titles(alice)).toEqual(titles(bob));
    expect(titles(alice)).toHaveLength(3);
    // The tied keys still allow a later move between them.
    const t = tree(alice);
    const last = t.roots[2].page.id;
    expect(movePage(alice, t, last, null, 1)).toBe(true);
    expect(titles(alice)[1]).toBe(t.roots[2].page.title);
  });
});
