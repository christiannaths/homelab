import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import type { Workspace } from "./access.ts";
import type { Person } from "./people.ts";
import { placementLevel, reviewUpdate } from "./review.ts";
import type { PageMeta } from "./tree.ts";
import { metaMap, pageDocName, privateSection, setPersonAccess, teamspaceSection } from "./workspace.ts";

const people: Person[] = [
  { id: "max", name: "Max", role: "member" },
  { id: "nia", name: "Nia", role: "member" },
];
const page = (id: string, over: Partial<PageMeta> = {}): PageMeta => ({
  id, title: id, kind: "page", parentId: null, section: privateSection("max"), order: "a0", createdAt: 1, ...over,
});
// Max's Private pages: Trip shared with Nia at Can edit, Menu at Can view.
const workspace: Workspace = {
  people,
  pages: [page("trip", { access: { people: { nia: "edit" } } }), page("menu", { access: { people: { nia: "view" } } })],
};

/** A page document as a device would create it, as one update. */
function newPage(meta: PageMeta, access?: Record<string, "full" | "edit">): Uint8Array {
  const doc = new Y.Doc();
  doc.transact(() => {
    const m = metaMap(doc);
    for (const key of ["title", "kind", "parentId", "section", "order", "createdAt"] as const) m.set(key, meta[key]);
    for (const [personId, level] of Object.entries(access ?? {})) setPersonAccess(doc, personId, level);
  });
  return Y.encodeStateAsUpdate(doc);
}

describe("placing a new page", () => {
  it("gives its creator what its place in the tree gives them, ignoring the page's own access", () => {
    expect(placementLevel(workspace, "nia", page("mine", { section: privateSection("nia") }))).toBe("full");
    expect(placementLevel(workspace, "nia", page("planted", { section: privateSection("max") }))).toBe("none");
    expect(placementLevel(workspace, "nia", page("sub", { parentId: "trip" }))).toBe("edit");
    expect(placementLevel(workspace, "nia", page("sub", { parentId: "menu" }))).toBe("view");
    // A grant on the new page itself doesn't count towards placing it.
    expect(placementLevel(workspace, "nia", page("sub", { parentId: "menu", access: { people: { nia: "full" } } }))).toBe("view");
    // A parent the server hasn't seen (created offline, not synced yet) counts as missing: the page's own section decides.
    expect(placementLevel(workspace, "nia", page("sub", { parentId: "unsynced", section: privateSection("nia") }))).toBe("full");
    expect(placementLevel(workspace, "nia", page("sub", { parentId: "unsynced", section: privateSection("max") }))).toBe("none");
  });

  it("is reviewed as one update: refused where its creator can't edit, or if it grants what they can't", () => {
    const review = (meta: PageMeta, access?: Record<string, "full" | "edit">) =>
      reviewUpdate(workspace, "nia", pageDocName(meta.id), new Y.Doc(), newPage(meta, access));
    expect(review(page("a", { section: privateSection("nia") }), { max: "full" })).toBeNull();
    expect(review(page("b", { parentId: "trip" }))).toBeNull();
    expect(review(page("c", { parentId: "trip" }), { nia: "full" })).toBe("access-change-refused");
    expect(review(page("d", { parentId: "menu" }))).toBe("placement-refused");
    expect(review(page("e", { section: privateSection("max") }))).toBe("placement-refused");
  });

  it("refuses content for a page the server has never seen and that has no place yet", () => {
    const doc = new Y.Doc();
    doc.getXmlFragment("content").insert(0, [new Y.XmlText("orphan")]);
    expect(reviewUpdate(workspace, "nia", pageDocName("x"), new Y.Doc(), Y.encodeStateAsUpdate(doc))).toBe("placement-refused");
  });
});

describe("moving a page", () => {
  // Max's Private section: Trip (Nia: Can edit) with subpages Packing and Hotels, Menu (Nia: Can
  // view) and Plan (Nia: Full access). Nia's Private section: Notes.
  const ws: Workspace = {
    people,
    pages: [
      ...workspace.pages,
      page("packing", { parentId: "trip" }),
      page("hotels", { parentId: "trip", order: "a1" }),
      page("plan", { access: { people: { nia: "full" } } }),
      page("notes", { section: privateSection("nia") }),
    ],
  };
  const NIA = privateSection("nia");
  const MAX = privateSection("max");

  /** `personId` moves page `id` (as the server holds it) to `to`, in one update. */
  function move(personId: string, id: string, to: Partial<PageMeta>) {
    const before = ws.pages.find((p) => p.id === id)!;
    const server = new Y.Doc();
    Y.applyUpdate(server, newPage(before, before.access?.people as Record<string, "full" | "edit">));
    const device = new Y.Doc();
    Y.applyUpdate(device, Y.encodeStateAsUpdate(server));
    const sv = Y.encodeStateVector(device);
    device.transact(() => {
      for (const [key, value] of Object.entries(to)) metaMap(device).set(key, value);
    });
    return reviewUpdate(ws, personId, pageDocName(id), server, Y.encodeStateAsUpdate(device, sv));
  }

  it("is accepted from Can edit when nobody's access changes: a new place inside the same shared page, or a new order", () => {
    expect(move("nia", "packing", { parentId: "hotels" })).toBeNull();
    expect(move("nia", "packing", { order: "a2" })).toBeNull();
  });

  it("is refused from Can edit when it would change who can open the page, such as into the mover's own Private section", () => {
    expect(move("nia", "packing", { parentId: null, section: NIA })).toBe("access-change-refused");
    expect(move("nia", "packing", { parentId: "notes" })).toBe("access-change-refused");
  });

  it("is refused to a place the mover couldn't create a page in", () => {
    expect(move("nia", "packing", { parentId: "menu" })).toBe("placement-refused");
    expect(move("max", "packing", { parentId: null, section: NIA })).toBe("placement-refused");
    expect(move("max", "packing", { parentId: "notes" })).toBe("placement-refused");
  });

  it("is accepted from Full access, which may change who can open the page", () => {
    expect(move("max", "packing", { parentId: null, section: MAX })).toBeNull();
    expect(move("nia", "plan", { parentId: null, section: NIA })).toBeNull();
    // Nia's own page, moved under a page she can edit: Max gains access, which her Full access allows.
    expect(move("nia", "notes", { parentId: "trip" })).toBeNull();
  });

  it("out of a teamspace into the mover's Private section needs Full access, and into a teamspace needs Can edit there", () => {
    const team = (memberLevel: "edit" | "full"): Workspace => ({
      people,
      teamspaces: [{ id: "home", name: "Home", kind: "closed", isDefault: false, memberLevel, workspaceLevel: "view", members: { max: "owner", nia: "member" } }],
      pages: [page("chores", { section: teamspaceSection("home") }), page("notes", { section: privateSection("nia") })],
    });
    const moveIn = (w: Workspace, id: string, to: Partial<PageMeta>) => {
      const before = w.pages.find((p) => p.id === id)!;
      const server = new Y.Doc();
      Y.applyUpdate(server, newPage(before));
      const device = new Y.Doc();
      Y.applyUpdate(device, Y.encodeStateAsUpdate(server));
      const sv = Y.encodeStateVector(device);
      device.transact(() => Object.entries(to).forEach(([k, v]) => metaMap(device).set(k, v)));
      return reviewUpdate(w, "nia", pageDocName(id), server, Y.encodeStateAsUpdate(device, sv));
    };
    expect(moveIn(team("edit"), "chores", { section: privateSection("nia") })).toBe("access-change-refused");
    expect(moveIn(team("full"), "chores", { section: privateSection("nia") })).toBeNull();
    expect(moveIn(team("edit"), "notes", { section: teamspaceSection("home") })).toBeNull();
    const outsider: Workspace = { ...team("edit"), teamspaces: [{ ...team("edit").teamspaces![0], members: { max: "owner" } }] };
    expect(moveIn(outsider, "notes", { section: teamspaceSection("home") })).toBe("placement-refused");
  });
});
