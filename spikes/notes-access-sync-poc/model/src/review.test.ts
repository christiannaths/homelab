import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import type { Workspace } from "./access.ts";
import type { Person } from "./people.ts";
import { placementLevel, reviewUpdate } from "./review.ts";
import type { PageMeta } from "./tree.ts";
import { metaMap, pageDocName, privateSection, setPersonAccess } from "./workspace.ts";

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
