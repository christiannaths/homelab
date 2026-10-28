import { describe, expect, it } from "vitest";
import { page, WORKSPACE } from "./test-pages.ts";
import { ancestors, buildTree, type TreeNode } from "./tree.ts";

/** Each node as `id(children…)`, so a whole tree reads in one line. */
const shape = (nodes: readonly TreeNode[]): string[] =>
  nodes.map((n) =>
    n.children.length
      ? `${n.page.id}(${shape(n.children).join(" ")})`
      : n.page.id,
  );

describe("the page tree", () => {
  it("nests subpages under their parents, in order", () => {
    const tree = buildTree(
      [
        page("b", { order: "a1" }),
        page("a", { order: "a0" }),
        page("a2", { parentId: "a", order: "a1" }),
        page("a1", { parentId: "a", order: "a0" }),
        page("a1x", { parentId: "a1" }),
      ],
      WORKSPACE,
    );
    expect(shape(tree.roots)).toEqual(["a(a1(a1x) a2)", "b"]);
    expect(tree.byId.get("a1x")?.depth).toBe(2);
  });

  it("orders siblings with the same key by creation, then by id", () => {
    const tree = buildTree(
      [
        page("c", { createdAt: 2 }),
        page("b", { createdAt: 1 }),
        page("a", { createdAt: 2 }),
      ],
      WORKSPACE,
    );
    expect(shape(tree.roots)).toEqual(["b", "a", "c"]);
  });

  it("shows a page whose parent never arrived at the top of its section", () => {
    const tree = buildTree(
      [page("child", { parentId: "unreceived" })],
      WORKSPACE,
    );
    expect(shape(tree.roots)).toEqual(["child"]);
    expect(tree.byId.get("child")?.parentMissing).toBe(true);
  });

  it("shows only the workspace's own pages, and never nests under another workspace's page", () => {
    const tree = buildTree(
      [
        page("mine"),
        page("theirs", { workspaceId: "ws-2" }),
        page("stray", { parentId: "theirs" }),
      ],
      WORKSPACE,
    );
    expect(shape(tree.roots)).toEqual(["mine", "stray"]);
    expect(tree.byId.get("stray")?.parentMissing).toBe(true);
  });

  it("breaks a cycle from concurrent edits at its smallest id", () => {
    const tree = buildTree(
      [page("y", { parentId: "x" }), page("x", { parentId: "y" })],
      WORKSPACE,
    );
    expect(shape(tree.roots)).toEqual(["x(y)"]);
  });

  it("lists a page's ancestors from the top, for its breadcrumb", () => {
    const tree = buildTree(
      [page("a"), page("b", { parentId: "a" }), page("c", { parentId: "b" })],
      WORKSPACE,
    );
    expect(ancestors(tree, "c").map((n) => n.page.id)).toEqual(["a", "b"]);
    expect(ancestors(tree, "a")).toEqual([]);
  });
});

describe("the Trash", () => {
  it("takes a trashed page's subpages along, out of the sidebar and into the Trash", () => {
    const tree = buildTree(
      [
        page("keep"),
        page("gone", { deletedAt: 5 }),
        page("sub", { parentId: "gone" }),
        page("subsub", { parentId: "sub" }),
      ],
      WORKSPACE,
    );
    expect(shape(tree.roots)).toEqual(["keep"]);
    expect(tree.byId.has("sub")).toBe(false);
    expect(shape(tree.trash)).toEqual(["gone(sub(subsub))"]);
  });

  it("lists what was trashed newest first, a subpage trashed on its own included", () => {
    const tree = buildTree(
      [
        page("old", { deletedAt: 1 }),
        page("parent"),
        page("sub", { parentId: "parent", deletedAt: 3 }),
        page("new", { deletedAt: 9 }),
      ],
      WORKSPACE,
    );
    expect(shape(tree.roots)).toEqual(["parent"]);
    expect(shape(tree.trash)).toEqual(["new", "sub", "old"]);
  });

  it("keeps a subpage trashed before its parent inside the parent's entry", () => {
    const tree = buildTree(
      [
        page("parent", { deletedAt: 5 }),
        page("sub", { parentId: "parent", deletedAt: 2 }),
      ],
      WORKSPACE,
    );
    expect(shape(tree.trash)).toEqual(["parent(sub)"]);
  });
});
