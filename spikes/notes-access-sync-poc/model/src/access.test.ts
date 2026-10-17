import { describe, expect, it } from "vitest";
import {
  documentAccess,
  sidebarSections,
  visiblePageIds,
  type Workspace,
} from "./access.ts";
import { buildTree, type PageMeta } from "./tree.ts";
import { indexDocName, pageDocName, privateSection } from "./workspace.ts";

const people: Workspace["people"] = [
  { id: "o", name: "Olive", role: "owner" },
  { id: "m", name: "Max", role: "member" },
  { id: "n", name: "Nia", role: "member" },
  { id: "g", name: "Gus", role: "guest" },
];

const page = (
  id: string,
  parentId: string | null,
  section: string,
  extra: Partial<PageMeta> = {},
): PageMeta => ({
  id,
  title: id,
  kind: "page",
  parentId,
  section,
  order: "a0",
  createdAt: 0,
  ...extra,
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
    for (const id of ["diary", "secret", "deeper"])
      expect(documentAccess(workspace, "m", pageDocName(id))).toBe("full");
  });

  it("give everyone else no access, the workspace owner and guests included", () => {
    for (const person of ["o", "n", "g"]) {
      for (const id of ["diary", "secret", "deeper"])
        expect(documentAccess(workspace, person, pageDocName(id))).toBe("none");
    }
    expect(documentAccess(workspace, "m", pageDocName("plans"))).toBe("none");
  });

  it("list each person's visible pages, and only those", () => {
    expect([...visiblePageIds(workspace, "m")].sort()).toEqual([
      "deeper",
      "diary",
      "secret",
    ]);
    expect([...visiblePageIds(workspace, "o")]).toEqual(["plans"]);
    expect([...visiblePageIds(workspace, "n")]).toEqual([]);
  });

  it("follow the effective tree: a subpage takes its section from its top-level ancestor, not its own field", () => {
    // `moved` still says Olive's section (stale), but it now sits under Max's diary.
    const ws: Workspace = {
      people,
      pages: [...workspace.pages, page("moved", "diary", privateSection("o"))],
    };
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
    const ws: Workspace = {
      people,
      pages: [page("old", null, privateSection("m"), { deletedAt: 1 })],
    };
    expect(documentAccess(ws, "m", pageDocName("old"))).toBe("full");
    expect(documentAccess(ws, "o", pageDocName("old"))).toBe("none");
  });
});

describe("sharing a page", () => {
  // Max's Private section: trip > packing > shoes, and journal (unshared).
  const shared = (access: PageMeta["access"]): Workspace => ({
    people,
    pages: [
      page("trip", null, privateSection("m"), { access }),
      page("packing", "trip", privateSection("m")),
      page("shoes", "packing", privateSection("m")),
      page("journal", null, privateSection("m")),
    ],
  });

  it("gives an invited person the invite's level on the page and its subpages, and nothing else", () => {
    const ws = shared({ people: { n: "view" } });
    for (const id of ["trip", "packing", "shoes"])
      expect(documentAccess(ws, "n", pageDocName(id))).toBe("view");
    expect(documentAccess(ws, "n", pageDocName("journal"))).toBe("none");
    expect([...visiblePageIds(ws, "n")].sort()).toEqual([
      "packing",
      "shoes",
      "trip",
    ]);
    expect(documentAccess(ws, "o", pageDocName("trip"))).toBe("none");
  });

  it("keeps each of Notion's levels as invited, guests included", () => {
    const ws = shared({ people: { o: "full", n: "edit", g: "comment" } });
    expect(documentAccess(ws, "o", pageDocName("shoes"))).toBe("full");
    expect(documentAccess(ws, "n", pageDocName("shoes"))).toBe("edit");
    expect(documentAccess(ws, "g", pageDocName("shoes"))).toBe("comment");
  });

  it("can't restrict the Private section's own member", () => {
    const ws = shared({ people: { m: "view" } });
    expect(documentAccess(ws, "m", pageDocName("packing"))).toBe("full");
  });

  it("with Everyone in the workspace, gives every member and owner that level, but no guest", () => {
    const ws = shared({ workspace: "comment" });
    for (const person of ["o", "n"]) {
      expect([...visiblePageIds(ws, person)].sort()).toEqual([
        "packing",
        "shoes",
        "trip",
      ]);
      expect(documentAccess(ws, person, pageDocName("shoes"))).toBe("comment");
    }
    expect(visiblePageIds(ws, "g").size).toBe(0);
  });

  it("gives a person the most permissive level of all their sources", () => {
    const ws = shared({ workspace: "view", people: { n: "edit", o: "none" } });
    expect(documentAccess(ws, "n", pageDocName("trip"))).toBe("edit");
    // An invite below the general level doesn't lower it.
    expect(documentAccess(ws, "o", pageDocName("trip"))).toBe("view");
  });

  it("lets a subpage expand an inherited level, or invite someone just there", () => {
    const ws: Workspace = {
      people,
      pages: [
        page("trip", null, privateSection("m"), {
          access: { people: { n: "view" } },
        }),
        page("packing", "trip", privateSection("m"), {
          access: { people: { n: "edit", g: "view" } },
        }),
        page("shoes", "packing", privateSection("m")),
      ],
    };
    expect(documentAccess(ws, "n", pageDocName("trip"))).toBe("view");
    expect(documentAccess(ws, "n", pageDocName("shoes"))).toBe("edit");
    expect(documentAccess(ws, "g", pageDocName("trip"))).toBe("none");
    expect([...visiblePageIds(ws, "g")].sort()).toEqual(["packing", "shoes"]);
  });

  it("lets a subpage restrict an inherited level, down to No access for it and everything below", () => {
    const ws: Workspace = {
      people,
      pages: [
        page("trip", null, privateSection("m"), {
          access: { people: { n: "edit" }, workspace: "none" },
        }),
        page("packing", "trip", privateSection("m"), {
          access: { people: { n: "none" } },
        }),
        page("shoes", "packing", privateSection("m")),
      ],
    };
    expect([...visiblePageIds(ws, "n")]).toEqual(["trip"]);
  });

  it("follows a moved page: a page moved under a shared one is shared with it", () => {
    const ws = { ...shared({ people: { n: "view" } }) };
    const moved: Workspace = {
      people,
      pages: ws.pages.map((p) =>
        p.id === "journal" ? { ...p, parentId: "shoes" } : p,
      ),
    };
    expect(documentAccess(moved, "n", pageDocName("journal"))).toBe("view");
  });
});

describe("sidebar sections with sharing", () => {
  const trip = page("trip", null, privateSection("m"), {
    access: { people: { n: "view" } },
  });
  const packing = page("packing", "trip", privateSection("m"));
  const journal = page("journal", null, privateSection("m"));

  it("move the sharer's shared Private page to Shared, and leave unshared ones in Private", () => {
    const s = sidebarSections(buildTree([trip, packing, journal]), "m");
    expect(s.shared.map((n) => n.page.id)).toEqual(["trip"]);
    expect(s.shared[0].children.map((n) => n.page.id)).toEqual(["packing"]);
    expect(s.private.map((n) => n.page.id)).toEqual(["journal"]);
  });

  it("count Everyone in the workspace as shared, but not an entry that only names the member, or No access", () => {
    const general = { ...trip, access: { workspace: "view" as const } };
    const self = {
      ...trip,
      access: {
        people: { m: "full" as const, n: "none" as const },
        workspace: "none" as const,
      },
    };
    expect(
      sidebarSections(buildTree([general]), "m").shared.map((n) => n.page.id),
    ).toEqual(["trip"]);
    expect(
      sidebarSections(buildTree([self]), "m").private.map((n) => n.page.id),
    ).toEqual(["trip"]);
  });

  it("put a page shared with me from someone else's Private section in my Shared section", () => {
    const s = sidebarSections(buildTree([trip, packing]), "n");
    expect(s).toMatchObject({
      private: [],
      shared: [{ page: { id: "trip" } }],
    });
  });
});

describe("documents that are not existing pages", () => {
  it("let members and owners create a page the server has never seen; guests open it at Can edit until placed (#19)", () => {
    expect(documentAccess(workspace, "m", pageDocName("brand-new"))).toBe(
      "full",
    );
    expect(documentAccess(workspace, "o", pageDocName("brand-new"))).toBe(
      "full",
    );
    expect(documentAccess(workspace, "g", pageDocName("brand-new"))).toBe(
      "edit",
    );
  });

  it("let a person read only their own page index", () => {
    expect(documentAccess(workspace, "m", indexDocName("m"))).toBe("view");
    expect(documentAccess(workspace, "o", indexDocName("m"))).toBe("none");
  });

  it("refuse anyone outside the workspace, and any other document name", () => {
    expect(
      documentAccess(workspace, "stranger", pageDocName("brand-new")),
    ).toBe("none");
    expect(
      documentAccess(workspace, "stranger", indexDocName("stranger")),
    ).toBe("none");
    expect(documentAccess(workspace, "o", "workspace:default")).toBe("none");
  });
});
