import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { sidebarSections } from "./access.ts";
import { buildTree, flattenVisible, type PageMeta } from "./tree.ts";
import {
  createPage,
  metaMap,
  movePage,
  privateSection,
  readMeta,
  restorePage,
  trashPage,
  type PageDocs,
} from "./workspace.ts";

const MAX = privateSection("max");
const page = (
  id: string,
  parentId: string | null,
  order = "a0",
  extra: Partial<PageMeta> = {},
): PageMeta => ({
  id,
  title: id,
  kind: "page",
  parentId,
  section: MAX,
  order,
  createdAt: 0,
  ...extra,
});
const shape = (pages: PageMeta[]) =>
  flattenVisible(buildTree(pages), () => true).map(
    (n) => `${"  ".repeat(n.depth)}${n.page.id}`,
  );

/** A device: the page documents it holds, one Y.Doc per page. */
class Device implements PageDocs {
  readonly docs = new Map<string, Y.Doc>();
  get(id: string) {
    return this.docs.get(id);
  }
  create(id: string) {
    const doc = new Y.Doc();
    this.docs.set(id, doc);
    return doc;
  }
  tree() {
    return buildTree(
      [...this.docs].flatMap(([id, d]) => readMeta(id, d) ?? []),
    );
  }
  titles() {
    return flattenVisible(this.tree(), () => true).map(
      (n) => "  ".repeat(n.depth) + n.page.title,
    );
  }
  idOf(title: string) {
    return [...this.tree().byId.values()].find((n) => n.page.title === title)!
      .page.id;
  }
}

/** Syncs both ways every page document either device holds (or only `ids`), as the server would relay them. */
function sync(x: Device, y: Device, ids?: string[]) {
  for (const id of ids ?? new Set([...x.docs.keys(), ...y.docs.keys()])) {
    const a = x.get(id) ?? x.create(id);
    const b = y.get(id) ?? y.create(id);
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
  }
}

describe("buildTree", () => {
  it("nests pages and sorts siblings by order key", () => {
    expect(
      shape([
        page("b", null, "a1"),
        page("a", null, "a0"),
        page("c", "a", "a0"),
      ]),
    ).toEqual(["a", "  c", "b"]);
  });

  it("puts pages with a missing parent, or a database parent, at the top level", () => {
    const pages = [
      page("db", null, "a0", { kind: "database" }),
      page("x", "db", "a1"),
      page("y", "gone", "a2"),
    ];
    expect(shape(pages)).toEqual(["db", "x", "y"]);
  });

  it("breaks a cycle at its smallest id, whatever order the pages are listed in", () => {
    const pages = [
      page("b", "c"),
      page("c", "a"),
      page("a", "b"),
      page("d", "b"),
    ];
    const expected = ["a", "  c", "    b", "      d"];
    expect(shape(pages)).toEqual(expected);
    expect(shape(pages.toReversed())).toEqual(expected);
  });

  it("hides the subtree of a trashed page and lists only the trashed page itself in trash", () => {
    const t = buildTree([
      page("a", null),
      page("b", "a", "a0", { deletedAt: 5 }),
      page("c", "b"),
    ]);
    expect([...t.byId.keys()]).toEqual(["a"]);
    expect(t.trash.map((p) => p.id)).toEqual(["b"]);
  });

  it("gives every page its top-level ancestor's section, whatever its own field says", () => {
    const t = buildTree([
      page("a", null),
      page("b", "a", "a0", { section: "private:stale" }),
    ]);
    expect(t.byId.get("b")!.section).toBe(MAX);
  });
});

describe("sidebar sections", () => {
  it("puts my top-level pages in Private, and a page whose parent I didn't receive in Shared", () => {
    const pages = [
      page("mine", null),
      page("child", "mine"),
      page("orphan", "hidden-parent", "a1", {
        section: privateSection("olive"),
      }),
    ];
    const s = sidebarSections(buildTree(pages), "max");
    expect(s.private.map((n) => n.page.id)).toEqual(["mine"]);
    expect(s.shared.map((n) => n.page.id)).toEqual(["orphan"]);
  });

  it("keeps the page a cycle is broken at in my Private section", () => {
    const s = sidebarSections(
      buildTree([page("a", "b"), page("b", "a")]),
      "max",
    );
    expect(s.private.map((n) => n.page.id)).toEqual(["a"]);
    expect(s.shared).toEqual([]);
  });
});

describe("page operations on per-page documents", () => {
  it("creates pages in order and moves them between positions and parents", () => {
    const d = new Device();
    const a = createPage(d, d.tree(), { title: "a", section: MAX });
    createPage(d, d.tree(), { title: "b", section: MAX });
    const c = createPage(d, d.tree(), { title: "c", section: MAX });
    expect(d.titles()).toEqual(["a", "b", "c"]);

    expect(movePage(d, d.tree(), c, null, 0)).toBe(true);
    expect(d.titles()).toEqual(["c", "a", "b"]);

    expect(movePage(d, d.tree(), d.idOf("b"), a, 0)).toBe(true);
    expect(d.titles()).toEqual(["c", "a", "  b"]);
  });

  it("writes each page's title and place into that page's own document only", () => {
    const d = new Device();
    const a = createPage(d, d.tree(), { title: "Diary", section: MAX });
    const b = createPage(d, d.tree(), { title: "Secret", parentId: a });
    expect(metaMap(d.get(a)!).toJSON()).toMatchObject({
      title: "Diary",
      parentId: null,
      section: MAX,
    });
    expect(metaMap(d.get(b)!).toJSON()).toMatchObject({
      title: "Secret",
      parentId: a,
      section: MAX,
    });
    expect(JSON.stringify(d.get(a)!.toJSON())).not.toContain("Secret");
  });

  it("refuses to move a page into its own subtree or into a database", () => {
    const d = new Device();
    const a = createPage(d, d.tree(), { section: MAX });
    const b = createPage(d, d.tree(), { parentId: a });
    const db = createPage(d, d.tree(), { kind: "database", section: MAX });
    expect(movePage(d, d.tree(), a, b, 0)).toBe(false);
    expect(movePage(d, d.tree(), a, a, 0)).toBe(false);
    expect(movePage(d, d.tree(), a, db, 0)).toBe(false);
  });

  it("refuses to create a top-level page with no section", () => {
    const d = new Device();
    expect(() => createPage(d, d.tree(), { title: "nowhere" })).toThrow();
  });

  it("renumbers siblings whose order keys are tied", () => {
    const d = new Device();
    createPage(d, d.tree(), { title: "x", section: MAX, order: "a0" });
    createPage(d, d.tree(), { title: "y", section: MAX, order: "a0" });
    const z = createPage(d, d.tree(), { title: "z", section: MAX });
    movePage(d, d.tree(), z, null, 1);
    expect(d.titles()).toHaveLength(3);
    expect(d.titles()[1]).toBe("z");
  });

  it("restores a trashed page to the top level if its parent is still trashed", () => {
    const d = new Device();
    const a = createPage(d, d.tree(), { section: MAX });
    const b = createPage(d, d.tree(), { parentId: a });
    trashPage(d.get(b)!);
    trashPage(d.get(a)!);
    restorePage(d, d.tree(), b);
    const t = d.tree();
    expect(t.byId.get(b)?.parentId).toBeNull();
    expect(t.byId.has(a)).toBe(false);
  });

  it("does not rewrite a parent link to a page this device doesn't hold", () => {
    const d = new Device();
    const b = d.create("b");
    metaMap(b).set("parentId", "someone-elses");
    metaMap(b).set("section", MAX);
    metaMap(b).set("createdAt", 1);
    trashPage(b);
    restorePage(d, d.tree(), "b");
    expect(metaMap(b).get("parentId")).toBe("someone-elses");
  });
});

describe("concurrent edits under the per-page split (two devices, offline, then synced)", () => {
  it("A-under-B on one device and B-under-A on the other converge to the same acyclic tree", () => {
    const alice = new Device();
    const bob = new Device();
    const a = createPage(alice, alice.tree(), { title: "A", section: MAX });
    const b = createPage(alice, alice.tree(), { title: "B", section: MAX });
    sync(alice, bob);

    expect(movePage(alice, alice.tree(), a, b, 0)).toBe(true);
    expect(movePage(bob, bob.tree(), b, a, 0)).toBe(true);
    sync(alice, bob);

    expect(alice.titles()).toEqual(bob.titles());
    // Broken at the smaller id, which becomes top level, on both devices.
    const top = a < b ? "A" : "B";
    expect(alice.titles()).toEqual([top, `  ${top === "A" ? "B" : "A"}`]);
  });

  it("concurrent creates at the same position keep both pages, in the same order everywhere", () => {
    const alice = new Device();
    const bob = new Device();
    createPage(alice, alice.tree(), { title: "first", section: MAX });
    sync(alice, bob);
    createPage(alice, alice.tree(), { title: "from alice", section: MAX });
    createPage(bob, bob.tree(), { title: "from bob", section: MAX });
    sync(alice, bob);
    expect(alice.titles()).toEqual(bob.titles());
    expect(alice.titles()).toHaveLength(3);
    // The tied keys still allow a later move between them.
    const t = alice.tree();
    const last = t.roots[2].page.id;
    expect(movePage(alice, t, last, null, 1)).toBe(true);
    expect(alice.titles()[1]).toBe(t.roots[2].page.title);
  });

  it("a concurrent rename and move of the same page both survive", () => {
    const alice = new Device();
    const bob = new Device();
    const a = createPage(alice, alice.tree(), { title: "A", section: MAX });
    const b = createPage(alice, alice.tree(), { title: "B", section: MAX });
    sync(alice, bob);
    movePage(alice, alice.tree(), b, a, 0);
    metaMap(bob.get(b)!).set("title", "B renamed");
    sync(alice, bob);
    expect(alice.titles()).toEqual(["A", "  B renamed"]);
    expect(bob.titles()).toEqual(alice.titles());
  });

  it("a three-page cycle is broken the same way on every device, whatever order the documents arrive in", () => {
    const origin = new Device();
    const [a, b, c] = ["A", "B", "C"].map((title) =>
      createPage(origin, origin.tree(), { title, section: MAX }),
    );
    const devices = [new Device(), new Device(), new Device()];
    for (const d of devices) sync(origin, d);
    // Each device moves one page offline, closing a cycle between them.
    movePage(devices[0], devices[0].tree(), a, b, 0);
    movePage(devices[1], devices[1].tree(), b, c, 0);
    movePage(devices[2], devices[2].tree(), c, a, 0);
    // Sync in different orders, page document by page document.
    sync(devices[0], devices[1], [c, b, a]);
    sync(devices[1], devices[2], [a, c, b]);
    sync(devices[2], devices[0], [b, a, c]);
    sync(devices[0], devices[1]);
    const smallest = [a, b, c].toSorted()[0];
    for (const d of devices) {
      expect(d.titles()).toEqual(devices[0].titles());
      expect(d.tree().roots.map((n) => n.page.id)).toEqual([smallest]);
    }
  });

  it("a page whose parent a device never receives sits at the top level there, the same on every device", () => {
    const max = new Device();
    const diary = createPage(max, max.tree(), { title: "Diary", section: MAX });
    const entry = createPage(max, max.tree(), {
      title: "Entry",
      parentId: diary,
    });
    // Two devices that only receive the subpage (as a person who can open it but not its parent).
    const x = new Device();
    const y = new Device();
    sync(max, x, [entry]);
    sync(max, y, [entry]);
    expect(x.titles()).toEqual(["Entry"]);
    expect(y.titles()).toEqual(x.titles());
    expect(x.tree().byId.get(entry)!.parentHidden).toBe(true);
    // The stored parent is untouched: nobody wrote a repair.
    expect(metaMap(x.get(entry)!).get("parentId")).toBe(diary);
  });
});
