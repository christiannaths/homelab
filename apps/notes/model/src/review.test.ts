import { describe, expect, it } from "vitest";
import type { Catalog } from "./access.ts";
import { indexDocName, pageDocName, workspaceDocName } from "./documents.ts";
import type { Page } from "./page.ts";
import { documentLevel, reviewUpdate, type DocumentChange } from "./review.ts";
import { ADA, page, WORKSPACE } from "./test-pages.ts";

const BEN = "ben";
const DEE = "dee";
const CY = "cy";
const OTHER_WORKSPACE = "ws-2";

const both = { people: { [ADA]: "full", [BEN]: "edit" } } as const;

/** Ada's workspace, with Ben and Dee as members, beside Cy's own workspace. */
const catalog: Catalog = {
  pages: new Map(
    [
      page("home"),
      page("viewed", { access: { people: { [ADA]: "full", [BEN]: "view" } } }),
      page("p1", { access: both }),
      page("x", { parentId: "p1" }),
      page("p2", { access: both }),
      page("p3", { access: { people: { ...both.people, [DEE]: "view" } } }),
      page("cys", {
        workspaceId: OTHER_WORKSPACE,
        access: { people: { [CY]: "full" } },
      }),
    ].map((p) => [p.id, p]),
  ),
  members: new Map([
    [WORKSPACE, new Set([ADA, BEN, DEE])],
    [OTHER_WORKSPACE, new Set([CY])],
  ]),
};

const existing = (id: string) => catalog.pages.get(id)!;

/** A page update that leaves the page as `after`, touching `touched` (default: its `meta`). */
function changeTo(after: Page | null, touched = ["meta"]): DocumentChange {
  return { after, touched: new Set(touched) };
}

const review = (personId: string, id: string, change: DocumentChange) =>
  reviewUpdate(catalog, personId, pageDocName(id), change);

describe("reviewing an update to a page someone can open", () => {
  it("accepts an update that changes nothing, from anyone", () => {
    expect(review(CY, "home", changeTo(existing("home"), []))).toBeNull();
  });

  it("refuses any change below Can edit", () => {
    const content = changeTo(existing("viewed"), ["content"]);
    const title = changeTo({ ...existing("viewed"), title: "Mine" });
    expect(review(BEN, "viewed", content)).toBe("read-only");
    expect(review(BEN, "viewed", title)).toBe("read-only");
    expect(review(CY, "home", content)).toBe("read-only");
  });

  it("accepts Can edit changing the title, content and Trash", () => {
    const x = existing("x");
    expect(review(BEN, "x", changeTo(x, ["content"]))).toBeNull();
    expect(review(BEN, "x", changeTo({ ...x, title: "Renamed" }))).toBeNull();
    expect(review(BEN, "x", changeTo({ ...x, deletedAt: 9 }))).toBeNull();
  });

  it("refuses an access change below Full access", () => {
    const shared = {
      ...existing("x"),
      access: { people: { [DEE]: "edit" as const } },
    };
    expect(review(BEN, "x", changeTo(shared, ["access"]))).toBe(
      "access-change-refused",
    );
  });

  it("accepts Full access giving a workspace member a level", () => {
    const shared = {
      ...existing("home"),
      access: { people: { [ADA]: "full" as const, [BEN]: "edit" as const } },
    };
    expect(review(ADA, "home", changeTo(shared, ["access"]))).toBeNull();
  });

  it("refuses an access entry for someone outside the page's workspace", () => {
    const shared = {
      ...existing("home"),
      access: { people: { [ADA]: "full" as const, [CY]: "view" as const } },
    };
    expect(review(ADA, "home", changeTo(shared, ["access"]))).toBe(
      "access-change-refused",
    );
  });

  it("refuses moving a page to another workspace, even with Full access", () => {
    const moved = { ...existing("home"), workspaceId: OTHER_WORKSPACE };
    expect(review(ADA, "home", changeTo(moved))).toBe("placement-refused");
  });

  it("refuses an update that breaks the page's meta", () => {
    expect(review(ADA, "home", changeTo(null))).toBe("placement-refused");
  });
});

describe("reviewing an update that moves a page", () => {
  const xUnder = (parentId: string | null, access = existing("x").access) => ({
    ...existing("x"),
    parentId,
    access,
  });

  it("accepts Can edit moving it where nobody's level changes", () => {
    expect(review(BEN, "x", changeTo(xUnder("p2")))).toBeNull();
  });

  it("refuses Can edit moving it where someone's level changes", () => {
    expect(review(BEN, "x", changeTo(xUnder("p3")))).toBe(
      "access-change-refused",
    );
  });

  it("accepts Full access moving it where someone's level changes", () => {
    expect(review(ADA, "x", changeTo(xUnder("p3")))).toBeNull();
  });

  it("refuses moving it under a page the mover can't edit", () => {
    expect(review(BEN, "x", changeTo(xUnder("viewed")))).toBe(
      "placement-refused",
    );
    expect(review(ADA, "x", changeTo(xUnder("cys")))).toBe("placement-refused");
  });

  it("refuses moving it under one of its own subpages", () => {
    const withSubs = {
      ...catalog,
      pages: new Map(catalog.pages)
        .set("y", page("y", { parentId: "x" }))
        .set("z", page("z", { parentId: "y" })),
    };
    for (const parentId of ["x", "y", "z"])
      expect(
        reviewUpdate(
          withSubs,
          ADA,
          pageDocName("x"),
          changeTo(xUnder(parentId)),
        ),
      ).toBe("placement-refused");
  });

  it("refuses moving it under a page in the Trash, or below one", () => {
    const trashed = {
      ...catalog,
      pages: new Map(catalog.pages)
        .set("bin", page("bin", { access: both, deletedAt: 5 }))
        .set("binned", page("binned", { parentId: "bin" })),
    };
    for (const parentId of ["bin", "binned"])
      expect(
        reviewUpdate(
          trashed,
          ADA,
          pageDocName("x"),
          changeTo(xUnder(parentId)),
        ),
      ).toBe("placement-refused");
  });

  it("accepts a restore to the top level that keeps what the page inherited", () => {
    const restored = xUnder(null, both);
    expect(review(ADA, "x", changeTo(restored, ["meta", "access"]))).toBeNull();
  });

  it("refuses a move to the top level that leaves the mover without Full access there", () => {
    expect(review(ADA, "x", changeTo(xUnder(null)))).toBe("placement-refused");
  });
});

describe("reviewing an update that creates a page", () => {
  const created = (fields: Partial<Page> = {}) => page("new", fields);

  it("accepts a top-level page in the creator's own workspace, at Full access for them", () => {
    expect(
      review(ADA, "new", changeTo(created(), ["meta", "access"])),
    ).toBeNull();
  });

  it("refuses a page in a workspace the creator doesn't belong to", () => {
    const theirs = created({ workspaceId: OTHER_WORKSPACE });
    expect(review(ADA, "new", changeTo(theirs, ["meta", "access"]))).toBe(
      "placement-refused",
    );
  });

  it("refuses a top-level page that isn't the creator's own Private page", () => {
    const forBen = created({ access: { people: { [BEN]: "full" } } });
    const nobodys = created({ access: { people: {} } });
    const elsewhere = created({ section: "teamspace:t1" });
    for (const p of [forBen, nobodys, elsewhere])
      expect(review(ADA, "new", changeTo(p, ["meta", "access"]))).toBe(
        "placement-refused",
      );
  });

  it("accepts a subpage of a page the creator can edit", () => {
    expect(
      review(BEN, "new", changeTo(created({ parentId: "p1" }))),
    ).toBeNull();
  });

  it("refuses a subpage of a page the creator can't edit, can't open, or that isn't there", () => {
    for (const parentId of ["viewed", "cys", "nowhere"])
      expect(review(BEN, "new", changeTo(created({ parentId })))).toBe(
        "placement-refused",
      );
  });

  it("refuses a new subpage of a page in the Trash", () => {
    const trashed = {
      ...catalog,
      pages: new Map(catalog.pages).set(
        "bin",
        page("bin", { access: both, deletedAt: 5 }),
      ),
    };
    expect(
      reviewUpdate(
        trashed,
        BEN,
        pageDocName("new"),
        changeTo(page("new", { parentId: "bin" })),
      ),
    ).toBe("placement-refused");
  });

  it("refuses a subpage that sets access where its creator is below Full access", () => {
    const sub = created({
      parentId: "p1",
      access: { people: { [DEE]: "edit" } },
    });
    expect(review(BEN, "new", changeTo(sub, ["meta", "access"]))).toBe(
      "access-change-refused",
    );
  });

  it("refuses content for a page with no meta", () => {
    expect(review(ADA, "new", changeTo(null, ["content"]))).toBe(
      "placement-refused",
    );
  });
});

describe("reviewing other documents", () => {
  const rename: DocumentChange = { touched: new Set(["workspace"]) };

  it("lets only a workspace's members change its document", () => {
    expect(
      reviewUpdate(catalog, BEN, workspaceDocName(WORKSPACE), rename),
    ).toBeNull();
    expect(reviewUpdate(catalog, CY, workspaceDocName(WORKSPACE), rename)).toBe(
      "read-only",
    );
  });

  it("lets nobody change an index", () => {
    expect(reviewUpdate(catalog, ADA, indexDocName(ADA), rename)).toBe(
      "read-only",
    );
  });
});

describe("the level a document opens at", () => {
  it("is the person's level on a page the server holds", () => {
    expect(documentLevel(catalog, BEN, pageDocName("viewed"))).toBe("view");
    expect(documentLevel(catalog, CY, pageDocName("home"))).toBe("none");
  });

  it("is Full access on a page the server has never seen, which its first update places", () => {
    expect(documentLevel(catalog, CY, pageDocName("unseen"))).toBe("full");
  });

  it("is Can edit on a workspace's document for its members only", () => {
    expect(documentLevel(catalog, DEE, workspaceDocName(WORKSPACE))).toBe(
      "edit",
    );
    expect(documentLevel(catalog, CY, workspaceDocName(WORKSPACE))).toBe(
      "none",
    );
    expect(documentLevel(catalog, CY, workspaceDocName("unknown"))).toBe(
      "none",
    );
  });

  it("is Can view on the person's own index and nothing on anyone else's", () => {
    expect(documentLevel(catalog, ADA, indexDocName(ADA))).toBe("view");
    expect(documentLevel(catalog, ADA, indexDocName(BEN))).toBe("none");
  });

  it("is nothing for a name that isn't a Notes document", () => {
    expect(documentLevel(catalog, ADA, "something-else")).toBe("none");
  });
});
