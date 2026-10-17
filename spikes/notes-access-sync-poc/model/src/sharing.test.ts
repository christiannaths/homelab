import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  pageLevels,
  readOnlyAt,
  refuseUpdate,
  type AccessLevel,
  type Workspace,
} from "./access.ts";
import type { Person } from "./people.ts";
import {
  createPage,
  movePage,
  privateSection,
  readIndex,
  readIndexLevels,
  readMeta,
  setPersonAccess,
  setWorkspaceAccess,
  writeIndex,
  type PageDocs,
} from "./workspace.ts";
import { buildTree } from "./tree.ts";

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
  pages() {
    return [...this.docs].flatMap(([id, d]) => readMeta(id, d) ?? []);
  }
  tree() {
    return buildTree(this.pages());
  }
  /** Every person's levels, as the server would work them out from this device's documents. */
  levels(): Record<string, Record<string, string>> {
    const ws: Workspace = { people, pages: this.pages() };
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

describe("access stored in the page document", () => {
  it("reads back as the page's own access, and Restore inherited access removes an entry", () => {
    const device = new Device();
    const id = createPage(device, device.tree(), {
      title: "Trip",
      section: MAX,
    });
    const doc = device.get(id)!;
    expect(readMeta(id, doc)?.access).toBeUndefined();

    setPersonAccess(doc, "nia", "view");
    setWorkspaceAccess(doc, "comment");
    expect(readMeta(id, doc)?.access).toEqual({
      people: { nia: "view" },
      workspace: "comment",
    });

    setPersonAccess(doc, "nia", null);
    setWorkspaceAccess(doc, null);
    expect(readMeta(id, doc)?.access).toBeUndefined();
  });

  it("ignores entries that aren't access levels, as a buggy or old client might write", () => {
    const device = new Device();
    const id = createPage(device, device.tree(), {
      title: "Trip",
      section: MAX,
    });
    const doc = device.get(id)!;
    doc.getMap("access").set("person:nia", "owner-ish");
    doc.getMap("access").set("something", "view");
    expect(readMeta(id, doc)?.access).toBeUndefined();
  });
});

describe("concurrent access changes (two devices, offline, then synced)", () => {
  it("two invites to different people both survive", () => {
    const laptop = new Device();
    const phone = new Device();
    const id = createPage(laptop, laptop.tree(), {
      title: "Trip",
      section: MAX,
    });
    sync(laptop, phone);
    setPersonAccess(laptop.get(id)!, "nia", "edit");
    setPersonAccess(phone.get(id)!, "olive", "view");
    sync(laptop, phone);
    expect(laptop.levels()).toEqual(phone.levels());
    expect(laptop.levels()).toMatchObject({
      nia: { [id]: "edit" },
      olive: { [id]: "view" },
    });
  });

  it("two different levels for the same person end up as the same one on every device", () => {
    const laptop = new Device();
    const phone = new Device();
    const id = createPage(laptop, laptop.tree(), {
      title: "Trip",
      section: MAX,
    });
    sync(laptop, phone);
    setPersonAccess(laptop.get(id)!, "nia", "edit");
    setPersonAccess(phone.get(id)!, "nia", "view");
    setWorkspaceAccess(laptop.get(id)!, "view");
    setWorkspaceAccess(phone.get(id)!, null);
    sync(laptop, phone);
    expect(readMeta(id, laptop.get(id)!)?.access).toEqual(
      readMeta(id, phone.get(id)!)?.access,
    );
    expect(laptop.levels()).toEqual(phone.levels());
  });

  it("a move under a shared page and an unshare of that page agree on who can open what", () => {
    const laptop = new Device();
    const phone = new Device();
    const trip = createPage(laptop, laptop.tree(), {
      title: "Trip",
      section: MAX,
    });
    const notes = createPage(laptop, laptop.tree(), {
      title: "Notes",
      section: MAX,
    });
    setPersonAccess(laptop.get(trip)!, "nia", "view");
    sync(laptop, phone);
    expect(movePage(laptop, laptop.tree(), notes, trip, 0)).toBe(true);
    setPersonAccess(phone.get(trip)!, "nia", null);
    sync(laptop, phone);
    expect(laptop.levels()).toEqual(phone.levels());
    expect(laptop.levels().nia).toEqual({});
  });
});

describe("a person's page index", () => {
  it("lists each page they can open with their level, and a rewrite touches only what changed", () => {
    const index = new Y.Doc();
    writeIndex(
      index,
      new Map([
        ["a", "full"],
        ["b", "view"],
      ]),
    );
    expect(readIndex(index)).toEqual(["a", "b"]);
    expect(readIndexLevels(index)).toEqual(
      new Map([
        ["a", "full"],
        ["b", "view"],
      ]),
    );

    const changed: string[] = [];
    index.getMap("pages").observe((e) => changed.push(...e.keysChanged));
    writeIndex(
      index,
      new Map([
        ["a", "full"],
        ["b", "edit"],
        ["c", "comment"],
      ]),
    );
    expect(changed.sort()).toEqual(["b", "c"]);
    expect(readIndexLevels(index)).toEqual(
      new Map([
        ["a", "full"],
        ["b", "edit"],
        ["c", "comment"],
      ]),
    );

    writeIndex(index, new Map([["c", "comment"]]));
    expect(readIndex(index)).toEqual(["c"]);
  });
});

describe("which updates a connection may apply", () => {
  it("lets Full access change anything, Can edit anything but access, and nothing below that", () => {
    const all = new Set(["meta", "content", "access"]);
    expect(refuseUpdate("full", all)).toBeNull();
    expect(refuseUpdate("edit", new Set(["meta", "content"]))).toBeNull();
    expect(refuseUpdate("edit", all)).toBe("access-change-refused");
    expect(refuseUpdate("view", new Set(["content"]))).toBe("read-only");
    expect(refuseUpdate("comment", new Set(["content"]))).toBe("read-only");
    expect(refuseUpdate("view", new Set())).toBeNull();
  });

  it("opens Can view and Can comment read-only, and every other level a person can open read-write", () => {
    expect(
      ["full", "edit", "edit-content", "comment", "view"].filter((l) =>
        readOnlyAt(l as AccessLevel),
      ),
    ).toEqual(["comment", "view"]);
  });
});
