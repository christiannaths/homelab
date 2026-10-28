import { describe, expect, it } from "vitest";
import { levelOn, pageLevels, type Catalog } from "./access.ts";
import type { Page } from "./page.ts";
import { ADA, page, WORKSPACE } from "./test-pages.ts";

const BEN = "ben";
const CY = "cy";

function catalog(pages: Page[], members = [ADA, BEN, CY]): Catalog {
  return {
    pages: new Map(pages.map((p) => [p.id, p])),
    members: new Map([[WORKSPACE, new Set(members)]]),
  };
}

const levels = (c: Catalog, personId: string) =>
  Object.fromEntries(pageLevels(c, personId));

describe("a person's level on a page", () => {
  it("comes down from the page above: Ada's Full access reaches every subpage, trashed ones too", () => {
    const c = catalog([
      page("top"),
      page("sub", { parentId: "top" }),
      page("subsub", { parentId: "sub", deletedAt: 3 }),
    ]);
    expect(levels(c, ADA)).toEqual({
      top: "full",
      sub: "full",
      subsub: "full",
    });
  });

  it("is nothing without an entry anywhere above", () => {
    const c = catalog([page("top"), page("sub", { parentId: "top" })]);
    expect(levels(c, BEN)).toEqual({});
    expect(levelOn(c, BEN, "sub")).toBe("none");
  });

  it("from an invite on a subpage reaches that subpage and below, not its parent", () => {
    const c = catalog([
      page("top"),
      page("sub", { parentId: "top", access: { people: { [BEN]: "edit" } } }),
      page("subsub", { parentId: "sub" }),
    ]);
    expect(levels(c, BEN)).toEqual({ sub: "edit", subsub: "edit" });
  });

  it("No access on a subpage hides it and below from that person only", () => {
    const c = catalog([
      page("top", { access: { people: { [ADA]: "full", [BEN]: "edit" } } }),
      page("sub", { parentId: "top", access: { people: { [BEN]: "none" } } }),
      page("subsub", { parentId: "sub" }),
    ]);
    expect(levels(c, BEN)).toEqual({ top: "edit" });
    expect(levels(c, ADA)).toEqual({
      top: "full",
      sub: "full",
      subsub: "full",
    });
  });

  it("is set again by an entry below a No access override", () => {
    const c = catalog([
      page("top", { access: { people: { [ADA]: "full", [BEN]: "edit" } } }),
      page("sub", { parentId: "top", access: { people: { [BEN]: "none" } } }),
      page("subsub", {
        parentId: "sub",
        access: { people: { [BEN]: "view" } },
      }),
    ]);
    expect(levels(c, BEN)).toEqual({ top: "edit", subsub: "view" });
  });

  it("is the most permissive of the person's entry and general access", () => {
    const c = catalog([
      page("a", {
        access: { people: { [ADA]: "full", [BEN]: "view" }, workspace: "edit" },
      }),
      page("b", {
        access: { people: { [ADA]: "full", [BEN]: "full" }, workspace: "view" },
      }),
    ]);
    expect(levels(c, BEN)).toEqual({ a: "edit", b: "full" });
    expect(levels(c, CY)).toEqual({ a: "edit", b: "view" });
  });

  it("keeps general access through a No access override, which replaces only the person's own entry", () => {
    const c = catalog([
      page("top", { access: { people: { [ADA]: "full" }, workspace: "edit" } }),
      page("sub", { parentId: "top", access: { people: { [BEN]: "none" } } }),
    ]);
    expect(levelOn(c, BEN, "sub")).toBe("edit");
  });

  it("is nothing for someone outside the page's workspace, whatever the page says", () => {
    const c = catalog(
      [
        page("top", {
          access: {
            people: { [ADA]: "full", [BEN]: "full" },
            workspace: "edit",
          },
        }),
      ],
      [ADA],
    );
    expect(levels(c, BEN)).toEqual({});
  });

  it("treats a page under a missing parent, or at a broken cycle, as top level", () => {
    const c = catalog([
      page("orphan", {
        parentId: "gone",
        access: { people: { [BEN]: "view" } },
      }),
      page("x", { parentId: "y", access: { people: { [BEN]: "edit" } } }),
      page("y", { parentId: "x" }),
    ]);
    expect(levels(c, BEN)).toEqual({ orphan: "view", x: "edit", y: "edit" });
  });
});
