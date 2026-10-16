import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { pageLevels, refuseUpdate, type Workspace } from "./access.ts";
import type { Person } from "./people.ts";
import { touchedRoots } from "./updates.ts";
import {
  createPage, metaMap, movePage, privateSection, readIndex, readIndexLevels, readMeta, setPersonAccess,
  setWorkspaceAccess, writeIndex, type PageDocs,
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
    return Object.fromEntries(people.map((p) => [p.id, Object.fromEntries([...pageLevels(ws, p.id)].sort())]));
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
    const id = createPage(device, device.tree(), { title: "Trip", section: MAX });
    const doc = device.get(id)!;
    expect(readMeta(id, doc)?.access).toBeUndefined();

    setPersonAccess(doc, "nia", "view");
    setWorkspaceAccess(doc, "comment");
    expect(readMeta(id, doc)?.access).toEqual({ people: { nia: "view" }, workspace: "comment" });

    setPersonAccess(doc, "nia", null);
    setWorkspaceAccess(doc, null);
    expect(readMeta(id, doc)?.access).toBeUndefined();
  });

  it("ignores entries that aren't access levels, as a buggy or old client might write", () => {
    const device = new Device();
    const id = createPage(device, device.tree(), { title: "Trip", section: MAX });
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
    const id = createPage(laptop, laptop.tree(), { title: "Trip", section: MAX });
    sync(laptop, phone);
    setPersonAccess(laptop.get(id)!, "nia", "edit");
    setPersonAccess(phone.get(id)!, "olive", "view");
    sync(laptop, phone);
    expect(laptop.levels()).toEqual(phone.levels());
    expect(laptop.levels()).toMatchObject({ nia: { [id]: "edit" }, olive: { [id]: "view" } });
  });

  it("two different levels for the same person end up as the same one on every device", () => {
    const laptop = new Device();
    const phone = new Device();
    const id = createPage(laptop, laptop.tree(), { title: "Trip", section: MAX });
    sync(laptop, phone);
    setPersonAccess(laptop.get(id)!, "nia", "edit");
    setPersonAccess(phone.get(id)!, "nia", "view");
    setWorkspaceAccess(laptop.get(id)!, "view");
    setWorkspaceAccess(phone.get(id)!, null);
    sync(laptop, phone);
    expect(readMeta(id, laptop.get(id)!)?.access).toEqual(readMeta(id, phone.get(id)!)?.access);
    expect(laptop.levels()).toEqual(phone.levels());
  });

  it("a move under a shared page and an unshare of that page agree on who can open what", () => {
    const laptop = new Device();
    const phone = new Device();
    const trip = createPage(laptop, laptop.tree(), { title: "Trip", section: MAX });
    const notes = createPage(laptop, laptop.tree(), { title: "Notes", section: MAX });
    setPersonAccess(laptop.get(trip)!, "nia", "view");
    sync(laptop, phone);
    expect(movePage(laptop, laptop.tree(), notes, trip, 0)).toBe(true);
    setPersonAccess(phone.get(trip)!, "nia", null);
    sync(laptop, phone);
    expect(laptop.levels()).toEqual(phone.levels());
    expect(laptop.levels().nia).toEqual({});
  });
});

describe("what an update touches", () => {
  const setup = () => {
    const device = new Device();
    const id = createPage(device, device.tree(), { title: "Trip", section: MAX });
    const server = new Y.Doc();
    Y.applyUpdate(server, Y.encodeStateAsUpdate(device.get(id)!));
    return { doc: device.get(id)!, server };
  };
  const changeOf = (doc: Y.Doc, change: () => void) => {
    const before = Y.encodeStateVector(doc);
    change();
    return Y.encodeStateAsUpdate(doc, before);
  };

  /** Checks a change the way the server does, then applies it, as the server would once it accepts it. */
  const check = (doc: Y.Doc, server: Y.Doc, change: () => void) => {
    const update = changeOf(doc, change);
    const touched = touchedRoots(server, update);
    Y.applyUpdate(server, update);
    return touched;
  };

  it("names the top-level parts of the document an update changes", () => {
    const { doc, server } = setup();
    expect(check(doc, server, () => metaMap(doc).set("title", "Trip!"))).toEqual(new Set(["meta"]));
    expect(check(doc, server, () => doc.getXmlFragment("content").insert(0, [new Y.XmlText("hi")])))
      .toEqual(new Set(["content"]));
    expect(check(doc, server, () => setPersonAccess(doc, "nia", "full"))).toEqual(new Set(["access"]));
  });

  it("sees a deletion, and a change nested deep inside the content", () => {
    const { doc, server } = setup();
    check(doc, server, () => setPersonAccess(doc, "nia", "view"));
    expect(check(doc, server, () => setPersonAccess(doc, "nia", null))).toEqual(new Set(["access"]));

    const para = new Y.XmlElement("paragraph");
    const text = new Y.XmlText("a");
    check(doc, server, () => (para.insert(0, [text]), doc.getXmlFragment("content").insert(0, [para])));
    expect(check(doc, server, () => text.insert(1, "b"))).toEqual(new Set(["content"]));
  });

  it("checks an update that arrived before one it depends on when that one arrives", () => {
    const { doc, server } = setup();
    // An insert, not a rename: every update carries the whole delete set, so a rename's deletion of
    // the old title would also ride along with the grant.
    const text = changeOf(doc, () => doc.getXmlFragment("content").insert(0, [new Y.XmlText("hi")]));
    const grant = changeOf(doc, () => setPersonAccess(doc, "nia", "full"));
    // On its own the grant can't be applied yet, so it changes nothing; the server keeps it pending.
    expect(touchedRoots(server, grant)).toEqual(new Set());
    Y.applyUpdate(server, grant);
    expect(server.getMap("access").size).toBe(0);
    // The update that completes it is charged with both.
    expect(touchedRoots(server, text)).toEqual(new Set(["content", "access"]));
  });

  it("names nothing for an update the server already has, and leaves the server's document alone", () => {
    const { doc, server } = setup();
    expect(touchedRoots(server, Y.encodeStateAsUpdate(doc))).toEqual(new Set());
    const grant = changeOf(doc, () => setPersonAccess(doc, "nia", "view"));
    touchedRoots(server, grant);
    expect(server.getMap("access").size).toBe(0);
  });
});

describe("a person's page index", () => {
  it("lists each page they can open with their level, and a rewrite touches only what changed", () => {
    const index = new Y.Doc();
    writeIndex(index, new Map([["a", "full"], ["b", "view"]]));
    expect(readIndex(index)).toEqual(["a", "b"]);
    expect(readIndexLevels(index)).toEqual(new Map([["a", "full"], ["b", "view"]]));

    const changed: string[] = [];
    index.getMap("pages").observe((e) => changed.push(...e.keysChanged));
    writeIndex(index, new Map([["a", "full"], ["b", "edit"], ["c", "comment"]]));
    expect(changed.sort()).toEqual(["b", "c"]);
    expect(readIndexLevels(index)).toEqual(new Map([["a", "full"], ["b", "edit"], ["c", "comment"]]));

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
});
