import { describe, expect, it } from "vitest";
import { documentAccess, visiblePageIds, type Workspace } from "./access.ts";
import type { PageMeta } from "./tree.ts";
import { indexDocName, pageDocName, privateSection } from "./workspace.ts";

const people: Workspace["people"] = [
  { id: "o", name: "Olive", role: "owner" },
  { id: "m", name: "Max", role: "member" },
  { id: "n", name: "Nia", role: "member" },
  { id: "g", name: "Gus", role: "guest" },
];

const page = (id: string, parentId: string | null, section: string, extra: Partial<PageMeta> = {}): PageMeta => ({
  id, title: id, kind: "page", parentId, section, order: "a0", createdAt: 0, ...extra,
});

// Max's Private section: diary > secret > deeper. Olive's: plans.
const workspace: Workspace = {
  people,
  pages: [
    page("diary", null, privateSection("m")),
    page("secret", "diary", privateSection("m")),
    page("deeper", "secret", privateSection("m")),
    page("plans", null, privateSection("o")),
  ],
};

describe("Private pages", () => {
  it("give the member whose Private section holds them full access, subpages included", () => {
    for (const id of ["diary", "secret", "deeper"]) expect(documentAccess(workspace, "m", pageDocName(id))).toBe("full");
  });

  it("give everyone else no access, the workspace owner and guests included", () => {
    for (const person of ["o", "n", "g"]) {
      for (const id of ["diary", "secret", "deeper"]) expect(documentAccess(workspace, person, pageDocName(id))).toBe("none");
    }
    expect(documentAccess(workspace, "m", pageDocName("plans"))).toBe("none");
  });

  it("list each person's visible pages, and only those", () => {
    expect([...visiblePageIds(workspace, "m")].sort()).toEqual(["deeper", "diary", "secret"]);
    expect([...visiblePageIds(workspace, "o")]).toEqual(["plans"]);
    expect([...visiblePageIds(workspace, "n")]).toEqual([]);
  });

  it("follow the effective tree: a subpage takes its section from its top-level ancestor, not its own field", () => {
    // `moved` still says Olive's section (stale), but it now sits under Max's diary.
    const ws: Workspace = { people, pages: [...workspace.pages, page("moved", "diary", privateSection("o"))] };
    expect(documentAccess(ws, "m", pageDocName("moved"))).toBe("full");
    expect(documentAccess(ws, "o", pageDocName("moved"))).toBe("none");
  });

  it("fall back to a page's own section when its parent is missing or a cycle is broken at it", () => {
    const ws: Workspace = {
      people,
      pages: [
        page("orphan", "never-synced", privateSection("n")),
        // A cycle from two concurrent moves: it is broken at "a", whose own section decides.
        page("a", "b", privateSection("n")),
        page("b", "a", privateSection("m")),
      ],
    };
    expect(documentAccess(ws, "n", pageDocName("orphan"))).toBe("full");
    expect(documentAccess(ws, "n", pageDocName("a"))).toBe("full");
    expect(documentAccess(ws, "n", pageDocName("b"))).toBe("full");
    expect(documentAccess(ws, "m", pageDocName("b"))).toBe("none");
  });

  it("stay readable to their member while in the trash", () => {
    const ws: Workspace = { people, pages: [page("old", null, privateSection("m"), { deletedAt: 1 })] };
    expect(documentAccess(ws, "m", pageDocName("old"))).toBe("full");
    expect(documentAccess(ws, "o", pageDocName("old"))).toBe("none");
  });
});

describe("documents that are not existing pages", () => {
  it("let members and owners create a page the server has never seen, but not guests", () => {
    expect(documentAccess(workspace, "m", pageDocName("brand-new"))).toBe("full");
    expect(documentAccess(workspace, "o", pageDocName("brand-new"))).toBe("full");
    expect(documentAccess(workspace, "g", pageDocName("brand-new"))).toBe("none");
  });

  it("let a person read only their own page index", () => {
    expect(documentAccess(workspace, "m", indexDocName("m"))).toBe("view");
    expect(documentAccess(workspace, "o", indexDocName("m"))).toBe("none");
  });

  it("refuse anyone outside the workspace, and any other document name", () => {
    expect(documentAccess(workspace, "stranger", pageDocName("brand-new"))).toBe("none");
    expect(documentAccess(workspace, "stranger", indexDocName("stranger"))).toBe("none");
    expect(documentAccess(workspace, "o", "workspace:default")).toBe("none");
  });
});
