import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { pageLevels, type Workspace } from "./access.ts";
import type { Person } from "./people.ts";
import { buildTree } from "./tree.ts";
import {
  createPage,
  movePage,
  privateSection,
  readMeta,
  setPersonAccess,
  setWorkspaceAccess,
  type PageDocs,
} from "./workspace.ts";

// Overrides are ordinary Yjs edits to page documents, so two devices that change them offline must
// end up agreeing on everyone's level once synced, with no repair written by anyone.

const people: Person[] = [
  { id: "max", name: "Max", role: "member" },
  { id: "nia", name: "Nia", role: "member" },
  { id: "olive", name: "Olive", role: "owner" },
];
const MAX = privateSection("max");

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
  doc(id: string) {
    return this.docs.get(id)!;
  }
  tree() {
    return buildTree(
      [...this.docs].flatMap(([id, d]) => readMeta(id, d) ?? []),
    );
  }
  /** Every person's levels, as the server would work them out from this device's documents. */
  levels(): Record<string, Record<string, string>> {
    const ws: Workspace = {
      people,
      pages: [...this.docs].flatMap(([id, d]) => readMeta(id, d) ?? []),
    };
    return Object.fromEntries(
      people.map((p) => [
        p.id,
        Object.fromEntries([...pageLevels(ws, p.id)].sort()),
      ]),
    );
  }
}

function sync(x: Device, y: Device) {
  for (const id of new Set([...x.docs.keys(), ...y.docs.keys()])) {
    const a = x.get(id) ?? x.create(id);
    const b = y.get(id) ?? y.create(id);
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
  }
}

/** Max's trip > packing > shoes, shared with Nia at Can edit from the top, on a laptop and a synced phone. */
function setup() {
  const laptop = new Device();
  const trip = createPage(laptop, laptop.tree(), {
    title: "Trip",
    section: MAX,
  });
  const packing = createPage(laptop, laptop.tree(), {
    title: "Packing",
    parentId: trip,
  });
  const shoes = createPage(laptop, laptop.tree(), {
    title: "Shoes",
    parentId: packing,
  });
  setPersonAccess(laptop.doc(trip), "nia", "edit");
  const phone = new Device();
  sync(laptop, phone);
  return { laptop, phone, trip, packing, shoes };
}

const visibleTo = (device: Device, personId: string) =>
  Object.keys(device.levels()[personId]).sort();

describe("concurrent overrides of the same page", () => {
  it("a restriction and an expansion of the same person agree on one of them on every device", () => {
    const { laptop, phone, trip, packing, shoes } = setup();
    setPersonAccess(laptop.doc(packing), "nia", "none");
    setPersonAccess(phone.doc(packing), "nia", "full");
    sync(laptop, phone);
    expect(laptop.levels()).toEqual(phone.levels());
    const nia = laptop.levels().nia;
    expect([
      { [trip]: "edit" },
      { [trip]: "edit", [packing]: "full", [shoes]: "full" },
    ]).toContainEqual(nia);
  });

  it("Restore inherited access on one device and a new level on another agree", () => {
    const { laptop, phone, packing } = setup();
    setPersonAccess(laptop.doc(packing), "nia", "view");
    sync(laptop, phone);
    setPersonAccess(laptop.doc(packing), "nia", null);
    setPersonAccess(phone.doc(packing), "nia", "comment");
    sync(laptop, phone);
    expect(readMeta(packing, laptop.doc(packing))?.access).toEqual(
      readMeta(packing, phone.doc(packing))?.access,
    );
    expect(laptop.levels()).toEqual(phone.levels());
  });

  it("overrides of different people, and of general access, on the same page all survive", () => {
    const { laptop, phone, trip, packing, shoes } = setup();
    setPersonAccess(laptop.doc(packing), "nia", "none");
    setPersonAccess(phone.doc(packing), "olive", "comment");
    setWorkspaceAccess(phone.doc(shoes), "view");
    sync(laptop, phone);
    expect(laptop.levels()).toEqual(phone.levels());
    expect(laptop.levels()).toMatchObject({
      nia: { [trip]: "edit" },
      olive: { [packing]: "comment", [shoes]: "comment" },
    });
  });
});

describe("a move that changes who can see a page", () => {
  it("moving a page out of a subtree another device restricts takes it out of the restriction on both", () => {
    const { laptop, phone, trip, packing, shoes } = setup();
    expect(movePage(laptop, laptop.tree(), shoes, trip, 1)).toBe(true);
    setPersonAccess(phone.doc(packing), "nia", "none");
    sync(laptop, phone);
    expect(laptop.levels()).toEqual(phone.levels());
    expect(visibleTo(laptop, "nia")).toEqual([shoes, trip].sort());
  });

  it("moving a page into a subtree another device restricts puts it under the restriction on both", () => {
    const { laptop, phone, trip, packing } = setup();
    const notes = createPage(laptop, laptop.tree(), {
      title: "Notes",
      parentId: trip,
    });
    sync(laptop, phone);
    expect(movePage(laptop, laptop.tree(), notes, packing, 0)).toBe(true);
    setPersonAccess(phone.doc(packing), "nia", "none");
    sync(laptop, phone);
    expect(laptop.levels()).toEqual(phone.levels());
    expect(visibleTo(laptop, "nia")).toEqual([trip]);
  });

  it("two moves that make a cycle across a restriction agree on who sees what", () => {
    const { laptop, phone, trip, packing } = setup();
    const a = createPage(laptop, laptop.tree(), { title: "A", parentId: trip });
    const b = createPage(laptop, laptop.tree(), {
      title: "B",
      parentId: packing,
    });
    setPersonAccess(laptop.doc(packing), "nia", "none");
    sync(laptop, phone);
    expect(movePage(laptop, laptop.tree(), a, b, 0)).toBe(true);
    expect(movePage(phone, phone.tree(), b, a, 0)).toBe(true);
    sync(laptop, phone);
    expect(laptop.levels()).toEqual(phone.levels());
  });
});
