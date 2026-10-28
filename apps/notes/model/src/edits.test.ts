import { describe, expect, it } from "vitest";
import { levelOn } from "./access.ts";
import { applyPatch, newPage, restorePatch } from "./edits.ts";
import type { Page } from "./page.ts";
import { ADA, page, WORKSPACE } from "./test-pages.ts";
import { buildTree } from "./tree.ts";

const ids = (pages: Page[], parentId: string | null) => {
  const tree = buildTree(pages, WORKSPACE);
  const list =
    parentId === null ? tree.roots : (tree.byId.get(parentId)?.children ?? []);
  return list.map((n) => n.page.id);
};

/** Adds a new page as Ada would, so it lands where the sidebar puts it. */
function add(
  pages: Page[],
  id: string,
  parentId: string | null = null,
): Page[] {
  return [
    ...pages,
    newPage(buildTree(pages, WORKSPACE), {
      id,
      workspaceId: WORKSPACE,
      parentId,
      creatorId: ADA,
      now: 100,
    }),
  ];
}

describe("a new page", () => {
  it("goes at the end of the Private section", () => {
    let pages = add([], "first");
    pages = add(pages, "second");
    pages = add(pages, "third");
    expect(ids(pages, null)).toEqual(["first", "second", "third"]);
  });

  it("goes at the end of its parent's subpages", () => {
    let pages = add([], "parent");
    pages = add(pages, "one", "parent");
    pages = add(pages, "two", "parent");
    expect(ids(pages, "parent")).toEqual(["one", "two"]);
  });

  it("still goes last when siblings' keys are tied or missing", () => {
    const pages = [
      page("x", { order: "", createdAt: 1 }),
      page("y", { order: "a3", createdAt: 2 }),
      page("z", { order: "a3", createdAt: 3 }),
    ];
    expect(ids(add(pages, "new"), null)).toEqual(["x", "y", "z", "new"]);
  });

  it("at the top level gives its creator Full access, so it is their Private page", () => {
    const [created] = add([], "p");
    expect(created).toMatchObject({
      id: "p",
      workspaceId: WORKSPACE,
      kind: "page",
      title: "",
      section: "private",
      parentId: null,
      createdAt: 100,
      deletedAt: null,
      access: { people: { [ADA]: "full" } },
    });
  });

  it("as a subpage sets no access of its own, so it inherits its parent's", () => {
    const pages = add(add([], "parent"), "sub", "parent");
    expect(pages[1]).toMatchObject({
      parentId: "parent",
      access: { people: {} },
    });
  });

  it("can't go under a page that isn't live in the tree", () => {
    expect(() => add([], "sub", "unknown")).toThrow();
  });
});

/** Ada's pages after she restores `id`, as her device would write it. */
function restore(pages: Page[], id: string): Page[] {
  const patch = restorePatch(pages, id);
  return pages.map((p) => (p.id === id && patch ? applyPatch(p, patch) : p));
}

const trashed = (pages: Page[]) =>
  buildTree(pages, WORKSPACE).trash.map((n) => n.page.id);

describe("restoring a page from the Trash", () => {
  it("brings it back where it was, with its subpages", () => {
    const pages = restore(
      [
        page("before", { order: "a0" }),
        page("gone", { order: "a1", deletedAt: 5 }),
        page("after", { order: "a2" }),
        page("sub", { parentId: "gone" }),
      ],
      "gone",
    );
    expect(ids(pages, null)).toEqual(["before", "gone", "after"]);
    expect(ids(pages, "gone")).toEqual(["sub"]);
    expect(trashed(pages)).toEqual([]);
  });

  it("puts a subpage back under its parent when only the subpage was trashed", () => {
    const pages = restore(
      [page("parent"), page("sub", { parentId: "parent", deletedAt: 5 })],
      "sub",
    );
    expect(ids(pages, "parent")).toEqual(["sub"]);
  });

  it("leaves a subpage trashed on its own in the Trash when its parent comes back", () => {
    const pages = restore(
      [
        page("parent", { deletedAt: 5 }),
        page("sub", { parentId: "parent", deletedAt: 2 }),
      ],
      "parent",
    );
    expect(ids(pages, "parent")).toEqual([]);
    expect(trashed(pages)).toEqual(["sub"]);
  });

  it("returns a page whose parent is still trashed to the end of the Private section, with its subpages", () => {
    const pages = restore(
      [
        page("live"),
        page("parent", { deletedAt: 5 }),
        page("sub", { parentId: "parent" }),
        page("subsub", { parentId: "sub" }),
      ],
      "sub",
    );
    expect(ids(pages, null)).toEqual(["live", "sub"]);
    expect(ids(pages, "sub")).toEqual(["subsub"]);
    expect(trashed(pages)).toEqual(["parent"]);
  });

  it("keeps everyone's level on a page it moves to the top level", () => {
    const before = [
      page("parent", {
        deletedAt: 5,
        access: {
          people: { [ADA]: "full", ben: "view" },
          workspace: "comment",
        },
      }),
      page("sub", { parentId: "parent", access: { people: { ben: "edit" } } }),
    ];
    const catalog = (pages: Page[]) => ({
      pages: new Map(pages.map((p) => [p.id, p])),
      members: new Map([[WORKSPACE, new Set([ADA, "ben", "cy"])]]),
    });
    const after = restore(before, "sub");
    for (const person of [ADA, "ben", "cy"])
      expect(levelOn(catalog(after), person, "sub")).toBe(
        levelOn(catalog(before), person, "sub"),
      );
  });

  it("leaves the link to a parent this device never received alone", () => {
    const pages = restore(
      [page("sub", { parentId: "unreceived", deletedAt: 5 })],
      "sub",
    );
    expect(pages[0]).toMatchObject({ parentId: "unreceived", deletedAt: null });
  });

  it("does nothing to a page that isn't in the Trash", () => {
    expect(restorePatch([page("live")], "live")).toBeNull();
    expect(restorePatch([], "unknown")).toBeNull();
  });
});
