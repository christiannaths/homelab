import { describe, expect, it } from "vitest";
import { pageLevels, sidebarSections, type Workspace } from "./access.ts";
import type { AccessLevel, PageAccess } from "./levels.ts";
import { breadcrumb, shareEntries } from "./overrides.ts";
import { buildTree, type PageMeta } from "./tree.ts";
import { privateSection } from "./workspace.ts";

const people: Workspace["people"] = [
  { id: "max", name: "Max", role: "member" },
  { id: "nia", name: "Nia", role: "member" },
  { id: "olive", name: "Olive", role: "owner" },
  { id: "gus", name: "Gus", role: "guest" },
];
const MAX = privateSection("max");

const page = (id: string, parentId: string | null, access?: PageAccess): PageMeta => ({
  id, title: id, kind: "page", parentId, section: MAX, order: "a0", createdAt: 0, access,
});

/** Max's Private section: trip > packing > shoes > laces, with access set as given per page. */
const tripTree = (access: Partial<Record<"trip" | "packing" | "shoes" | "laces", PageAccess>>): Workspace => ({
  people,
  pages: [
    page("trip", null, access.trip),
    page("packing", "trip", access.packing),
    page("shoes", "packing", access.shoes),
    page("laces", "shoes", access.laces),
  ],
});

const levels = (ws: Workspace, personId: string): Record<string, AccessLevel> =>
  Object.fromEntries([...pageLevels(ws, personId)].sort());

describe("overriding inherited access", () => {
  it("expands: raising someone's level on a subpage raises it there and below, not above", () => {
    const ws = tripTree({ trip: { people: { nia: "view" } }, packing: { people: { nia: "edit" } } });
    expect(levels(ws, "nia")).toEqual({ trip: "view", packing: "edit", shoes: "edit", laces: "edit" });
  });

  it("expands: inviting someone new on a subpage gives them that subpage and below only", () => {
    const ws = tripTree({ trip: { people: { nia: "view" } }, shoes: { people: { gus: "comment" } } });
    expect(levels(ws, "gus")).toEqual({ shoes: "comment", laces: "comment" });
  });

  it("restricts: lowering someone's level on a subpage lowers it there and below, not above", () => {
    const ws = tripTree({ trip: { people: { nia: "full" } }, packing: { people: { nia: "comment" } } });
    expect(levels(ws, "nia")).toEqual({ trip: "full", packing: "comment", shoes: "comment", laces: "comment" });
  });

  it("restricts to No access: the subpage and everything under it are gone, and a deeper invite brings back only its own subtree", () => {
    const restricted = tripTree({ trip: { people: { nia: "edit" } }, packing: { people: { nia: "none" } } });
    expect(levels(restricted, "nia")).toEqual({ trip: "edit" });
    const reinvited = tripTree({
      trip: { people: { nia: "edit" } }, packing: { people: { nia: "none" } }, shoes: { people: { nia: "view" } },
    });
    expect(levels(reinvited, "nia")).toEqual({ trip: "edit", shoes: "view", laces: "view" });
  });

  it("restores: removing the override gives back exactly what is inherited", () => {
    const restored = tripTree({ trip: { people: { nia: "edit" } }, packing: {} });
    expect(levels(restored, "nia")).toEqual({ trip: "edit", packing: "edit", shoes: "edit", laces: "edit" });
  });

  it("restores general access on a subpage the same way", () => {
    const restricted = tripTree({ trip: { workspace: "edit" }, packing: { workspace: "none" } });
    expect(levels(restricted, "olive")).toEqual({ trip: "edit" });
    const restored = tripTree({ trip: { workspace: "edit" } });
    expect(levels(restored, "olive")).toEqual({ trip: "edit", packing: "edit", shoes: "edit", laces: "edit" });
  });

  it("overrides one person without touching anyone else's inherited entry", () => {
    const ws = tripTree({ trip: { people: { nia: "edit", olive: "view" } }, packing: { people: { nia: "none" } } });
    expect(levels(ws, "olive")).toEqual({ trip: "view", packing: "view", shoes: "view", laces: "view" });
  });
});

describe("most permissive wins across sources", () => {
  it("a per-person No access doesn't beat general access: they keep the general level", () => {
    // ADR 13 and Notion: restricting one person only replaces their own entry.
    const ws = tripTree({ trip: { workspace: "comment", people: { nia: "edit" } }, packing: { people: { nia: "none" } } });
    expect(levels(ws, "nia")).toEqual({ trip: "edit", packing: "comment", shoes: "comment", laces: "comment" });
  });

  it("a per-person invite below general access doesn't lower it, and one above raises it", () => {
    const ws = tripTree({ trip: { workspace: "comment" }, packing: { people: { nia: "view", olive: "full" } } });
    expect(levels(ws, "nia")).toEqual({ trip: "comment", packing: "comment", shoes: "comment", laces: "comment" });
    expect(levels(ws, "olive")).toEqual({ trip: "comment", packing: "full", shoes: "full", laces: "full" });
  });

  it("an inherited entry and an inherited general level combine with ones set lower down", () => {
    const ws = tripTree({
      trip: { people: { nia: "view" } },
      packing: { workspace: "edit" },
      shoes: { people: { nia: "full" }, workspace: "none" },
      laces: { people: { nia: "comment" } },
    });
    expect(levels(ws, "nia")).toEqual({ trip: "view", packing: "edit", shoes: "full", laces: "comment" });
    expect(levels(ws, "olive")).toEqual({ packing: "edit" });
  });

  it("a guest gets nothing from general access, only from their own entries", () => {
    const ws = tripTree({ trip: { workspace: "full" }, shoes: { people: { gus: "view" } } });
    expect(levels(ws, "gus")).toEqual({ shoes: "view", laces: "view" });
  });

  it("the Private section's member keeps Full access, whatever the overrides say", () => {
    const ws = tripTree({ packing: { people: { max: "none" }, workspace: "none" } });
    expect(levels(ws, "max")).toEqual({ trip: "full", packing: "full", shoes: "full", laces: "full" });
  });
});

describe("a page whose parent is hidden", () => {
  // Nia can open trip and shoes (and laces below it), but not packing, which sits between them.
  const ws = tripTree({
    trip: { people: { nia: "view" } }, packing: { people: { nia: "none" } }, shoes: { people: { nia: "edit" } },
  });
  /** Nia's tree, built only from the page documents her device receives. */
  const niasTree = () => buildTree(ws.pages.filter((p) => pageLevels(ws, "nia").has(p.id)));

  it("is at the top of the Shared section, with its subpages under it", () => {
    const sidebar = sidebarSections(niasTree(), "nia");
    expect(sidebar.private).toEqual([]);
    expect(sidebar.shared.map((n) => [n.page.id, n.parentHidden, n.children.map((c) => c.page.id)])).toEqual([
      ["shoes", true, ["laces"]],
      ["trip", false, []],
    ]);
  });

  it("has a breadcrumb that skips the hidden parent and everything above it", () => {
    const tree = niasTree();
    expect(breadcrumb(tree, "laces").map((n) => n.page.title)).toEqual(["shoes", "laces"]);
    expect(breadcrumb(tree, "shoes").map((n) => n.page.title)).toEqual(["shoes"]);
    // Max holds the whole tree, so his breadcrumb shows every ancestor.
    expect(breadcrumb(buildTree([...ws.pages]), "laces").map((n) => n.page.title)).toEqual([
      "trip", "packing", "shoes", "laces",
    ]);
    expect(breadcrumb(tree, "packing")).toEqual([]);
  });
});

describe("the Share menu's entries", () => {
  it("lists entries inherited from ancestors with the page they come from, and ones set here as overrides", () => {
    const ws = tripTree({
      trip: { people: { nia: "view", olive: "edit" }, workspace: "comment" },
      packing: { people: { gus: "view" } },
      shoes: { people: { nia: "none" } },
    });
    expect(shareEntries(ws.pages, "shoes")).toEqual({
      people: [
        { personId: "nia", level: "none", from: "shoes", overrides: "view" },
        { personId: "gus", level: "view", from: "packing" },
        { personId: "olive", level: "edit", from: "trip" },
      ],
      workspace: { level: "comment", from: "trip" },
      inheritsFromHidden: false,
    });
  });

  it("marks a new invite on this page as not overriding anything, and an unset general access as from nowhere", () => {
    const ws = tripTree({ packing: { people: { nia: "edit" } } });
    expect(shareEntries(ws.pages, "packing")).toEqual({
      people: [{ personId: "nia", level: "edit", from: "packing" }],
      workspace: { level: "none", from: null },
      inheritsFromHidden: false,
    });
  });

  it("shows a general access override with the level it replaced", () => {
    const ws = tripTree({ trip: { workspace: "edit" }, shoes: { workspace: "none" } });
    expect(shareEntries(ws.pages, "shoes").workspace).toEqual({ level: "none", from: "shoes", overrides: "edit" });
    // Below the override it is just inherited.
    expect(shareEntries(ws.pages, "laces").workspace).toEqual({ level: "none", from: "shoes" });
  });

  it("says when some of the access may come from a parent this device doesn't hold", () => {
    const ws = tripTree({ trip: { people: { nia: "view" } }, shoes: { people: { nia: "edit" } } });
    const held = ws.pages.filter((p) => p.id === "shoes" || p.id === "laces");
    expect(shareEntries(held, "laces")).toEqual({
      people: [{ personId: "nia", level: "edit", from: "shoes" }],
      workspace: { level: "none", from: null },
      inheritsFromHidden: true,
    });
    expect(shareEntries(ws.pages, "laces").inheritsFromHidden).toBe(false);
  });
});
