import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { newPage, restorePatch, trashPatch } from "./edits.ts";
import { ADA, WORKSPACE } from "./test-pages.ts";
import { buildTree, type TreeNode } from "./tree.ts";
import { applyPagePatch, readPage, writeNewPage } from "./ydoc.ts";

// ADR-NOTE-006 rule 5: two devices edit offline, sync both ways, and derive the same valid tree.

/** One of Ada's devices: a Y.Doc per page it holds. */
class Device {
  readonly docs = new Map<string, Y.Doc>();
  pages() {
    return [...this.docs].flatMap(([id, doc]) => readPage(id, doc) ?? []);
  }
  tree() {
    return buildTree(this.pages(), WORKSPACE);
  }
  add(id: string, parentId: string | null = null, now = 1) {
    const doc = new Y.Doc();
    writeNewPage(
      doc,
      newPage(this.tree(), {
        id,
        workspaceId: WORKSPACE,
        parentId,
        creatorId: ADA,
        now,
      }),
    );
    this.docs.set(id, doc);
  }
  trash(id: string, now: number) {
    applyPagePatch(this.docs.get(id)!, trashPatch(now));
  }
  restore(id: string) {
    const patch = restorePatch(this.pages(), id);
    if (patch) applyPagePatch(this.docs.get(id)!, patch);
  }
  rename(id: string, title: string) {
    applyPagePatch(this.docs.get(id)!, { title });
  }
}

function sync(a: Device, b: Device) {
  for (const id of new Set([...a.docs.keys(), ...b.docs.keys()])) {
    const x = a.docs.get(id) ?? new Y.Doc();
    const y = b.docs.get(id) ?? new Y.Doc();
    Y.applyUpdate(y, Y.encodeStateAsUpdate(x, Y.encodeStateVector(y)));
    Y.applyUpdate(x, Y.encodeStateAsUpdate(y, Y.encodeStateVector(x)));
    a.docs.set(id, x);
    b.docs.set(id, y);
  }
}

const shape = (nodes: readonly TreeNode[]): string[] =>
  nodes.map((n) =>
    n.children.length
      ? `${n.page.id}(${shape(n.children).join(" ")})`
      : n.page.id,
  );

/** Both devices' sidebar and Trash, which must match once synced. */
function view(d: Device) {
  const tree = d.tree();
  return { sidebar: shape(tree.roots), trash: shape(tree.trash) };
}

/** A laptop and a phone holding the same pages, then going offline. */
function devices(setup: (d: Device) => void) {
  const laptop = new Device();
  setup(laptop);
  const phone = new Device();
  sync(laptop, phone);
  return { laptop, phone };
}

describe("concurrent edits to the page tree", () => {
  it("two new last pages added offline both land at the end, in the same order on both", () => {
    const { laptop, phone } = devices((d) => d.add("first"));
    laptop.add("from-laptop");
    phone.add("from-phone");
    sync(laptop, phone);
    expect(view(laptop)).toEqual(view(phone));
    expect(view(laptop).sidebar).toEqual([
      "first",
      "from-laptop",
      "from-phone",
    ]);
  });

  it("a subpage added under a page the other device trashed goes to the Trash with it, and back", () => {
    const { laptop, phone } = devices((d) => d.add("parent"));
    laptop.trash("parent", 5);
    phone.add("sub", "parent");
    sync(laptop, phone);
    expect(view(laptop)).toEqual(view(phone));
    expect(view(phone)).toEqual({ sidebar: [], trash: ["parent(sub)"] });

    phone.restore("parent");
    sync(laptop, phone);
    expect(view(laptop)).toEqual({ sidebar: ["parent(sub)"], trash: [] });
  });

  it("a rename and a trash of the same page both survive", () => {
    const { laptop, phone } = devices((d) => d.add("p"));
    laptop.rename("p", "Renamed");
    phone.trash("p", 5);
    sync(laptop, phone);
    expect(view(laptop)).toEqual(view(phone));
    expect(laptop.tree().trash[0]?.page.title).toBe("Renamed");
  });

  it("restoring a subpage alone on one device and its parent on the other ends the same on both", () => {
    const { laptop, phone } = devices((d) => {
      d.add("parent");
      d.add("sub", "parent");
      d.trash("parent", 5);
    });
    laptop.restore("sub");
    phone.restore("parent");
    sync(laptop, phone);
    expect(view(laptop)).toEqual(view(phone));
    expect(view(laptop)).toEqual({ sidebar: ["parent", "sub"], trash: [] });
  });
});
