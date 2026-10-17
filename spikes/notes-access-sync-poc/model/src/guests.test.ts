import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  documentAccess,
  sidebarSections,
  visiblePageIds,
  visibleTeamspaces,
  type Workspace,
} from "./access.ts";
import type { AccessLevel } from "./levels.ts";
import { reviewUpdate } from "./review.ts";
import type { Teamspace } from "./teamspaces.ts";
import { buildTree, type PageMeta } from "./tree.ts";
import {
  metaMap,
  pageDocName,
  privateSection,
  setPersonAccess,
  teamspaceDocName,
  teamspaceSection,
} from "./workspace.ts";

// Guests (#19), as in Notion and the people-and-roles spec: they see only what is shared with
// them and its subpages, have no Private section and no teamspaces, never get "Everyone in the
// workspace", and create pages only as subpages of a page they can edit.
const people: Workspace["people"] = [
  { id: "o", name: "Olive", role: "owner" },
  { id: "m", name: "Max", role: "member" },
  { id: "g", name: "Gus", role: "guest" },
  { id: "h", name: "Hana", role: "guest" },
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

const house: Teamspace = {
  id: "house",
  name: "House",
  kind: "open",
  isDefault: false,
  memberLevel: "edit",
  workspaceLevel: "edit",
  members: { m: "owner" },
};

// Max's Private section: trip (Gus can edit) > packing; notes (Gus can view); budget (Gus has
// Full); notice (Everyone in the workspace can edit). The open House teamspace: chores (shared
// with Gus at Can view) > bins, and garden (not shared).
const workspace: Workspace = {
  people,
  teamspaces: [house],
  pages: [
    page("trip", null, privateSection("m"), {
      access: { people: { g: "edit" } },
    }),
    page("packing", "trip", privateSection("m")),
    page("notes", null, privateSection("m"), {
      access: { people: { g: "view" } },
    }),
    page("budget", null, privateSection("m"), {
      access: { people: { g: "full" } },
    }),
    page("notice", null, privateSection("m"), {
      access: { workspace: "edit" },
    }),
    page("chores", null, teamspaceSection("house"), {
      access: { people: { g: "view" } },
    }),
    page("bins", "chores", teamspaceSection("house")),
    page("garden", null, teamspaceSection("house")),
  ],
};

/** A new page document as a device creates it: its metadata, and any access it sets, as one update. */
function newPage(
  meta: PageMeta,
  access: Record<string, AccessLevel> = {},
): Uint8Array {
  const doc = new Y.Doc();
  doc.transact(() => {
    const m = metaMap(doc);
    for (const key of [
      "title",
      "kind",
      "parentId",
      "section",
      "order",
      "createdAt",
    ] as const)
      m.set(key, meta[key]);
    for (const [personId, level] of Object.entries(access))
      setPersonAccess(doc, personId, level);
  });
  return Y.encodeStateAsUpdate(doc);
}

const create = (
  ws: Workspace,
  meta: PageMeta,
  access?: Record<string, AccessLevel>,
) =>
  reviewUpdate(
    ws,
    "g",
    pageDocName(meta.id),
    new Y.Doc(),
    newPage(meta, access),
  );

/** The server's copy of an existing page, and an update from a device that invites `personId` to it. */
function invite(
  pageId: string,
  personId: string,
  level: AccessLevel,
): { doc: Y.Doc; update: Uint8Array } {
  const meta = workspace.pages.find((p) => p.id === pageId)!;
  const doc = new Y.Doc();
  Y.applyUpdate(doc, newPage(meta));
  const device = new Y.Doc();
  Y.applyUpdate(device, Y.encodeStateAsUpdate(doc));
  const before = Y.encodeStateVector(device);
  setPersonAccess(device, personId, level);
  return { doc, update: Y.encodeStateAsUpdate(device, before) };
}

describe("guests", () => {
  it("receive only the pages shared with them and their subpages", () => {
    expect([...visiblePageIds(workspace, "g")].sort()).toEqual([
      "bins",
      "budget",
      "chores",
      "notes",
      "packing",
      "trip",
    ]);
  });

  it("never get Everyone in the workspace, nor an open teamspace's level for people who haven't joined", () => {
    expect(documentAccess(workspace, "g", pageDocName("notice"))).toBe("none");
    expect(documentAccess(workspace, "g", pageDocName("garden"))).toBe("none");
    // A member gets both.
    expect(documentAccess(workspace, "o", pageDocName("notice"))).toBe("edit");
    expect(documentAccess(workspace, "o", pageDocName("garden"))).toBe("edit");
  });

  it("given a page in a teamspace, get that page but never the teamspace itself", () => {
    expect(documentAccess(workspace, "g", pageDocName("chores"))).toBe("view");
    expect(documentAccess(workspace, "g", teamspaceDocName("house"))).toBe(
      "none",
    );
    expect(visibleTeamspaces(workspace, "g").size).toBe(0);
  });

  it("have no Private section: a page placed in one gives them nothing", () => {
    const ws: Workspace = {
      people,
      pages: [page("mine", null, privateSection("g"))],
    };
    expect(documentAccess(ws, "g", pageDocName("mine"))).toBe("none");
  });

  describe("creating pages", () => {
    it("may open a page document the server has never seen, so its first update can be checked", () => {
      expect(documentAccess(workspace, "g", pageDocName("brand-new"))).toBe(
        "edit",
      );
    });

    it("may create a subpage inside a page they can edit, at any depth", () => {
      expect(
        create(workspace, page("snacks", "trip", privateSection("g"))),
      ).toBeNull();
      expect(
        create(workspace, page("socks", "packing", privateSection("g"))),
      ).toBeNull();
    });

    it("may not create a subpage inside a page they can only view", () => {
      expect(
        create(workspace, page("draft", "notes", privateSection("g"))),
      ).toBe("placement-refused");
      expect(
        create(workspace, page("draft", "chores", teamspaceSection("house"))),
      ).toBe("placement-refused");
    });

    it("may not create a top-level page anywhere: not in a Private section, nor in a teamspace", () => {
      for (const section of [
        privateSection("g"),
        privateSection("m"),
        teamspaceSection("house"),
      ]) {
        expect(create(workspace, page("top", null, section))).toBe(
          "placement-refused",
        );
      }
    });

    it("may not create a subpage under a parent the server has never seen (it counts as top level)", () => {
      expect(
        create(workspace, page("lost", "nowhere", privateSection("g"))),
      ).toBe("placement-refused");
    });

    it("may set access on a new subpage only with Full access where it goes", () => {
      expect(
        create(workspace, page("snacks", "trip", privateSection("g")), {
          h: "view",
        }),
      ).toBe("access-change-refused");
      expect(
        create(workspace, page("receipts", "budget", privateSection("g")), {
          h: "view",
        }),
      ).toBeNull();
    });
  });

  describe("sharing", () => {
    it("with Full access, may share the page, with other guests too", () => {
      for (const personId of ["h", "o"]) {
        const { doc, update } = invite("budget", personId, "edit");
        expect(
          reviewUpdate(workspace, "g", pageDocName("budget"), doc, update),
        ).toBeNull();
      }
    });

    it("below Full access, may not share it", () => {
      const cases: [string, string][] = [
        ["trip", "access-change-refused"],
        ["notes", "read-only"],
      ];
      for (const [pageId, reason] of cases) {
        const { doc, update } = invite(pageId, "h", "view");
        expect(
          reviewUpdate(workspace, "g", pageDocName(pageId), doc, update),
        ).toBe(reason);
      }
    });
  });

  describe("sidebar", () => {
    it("puts a teamspace page in Shared for a device that doesn't hold the teamspace", () => {
      const pages = workspace.pages.filter((p) =>
        visiblePageIds(workspace, "g").has(p.id),
      );
      const s = sidebarSections(buildTree(pages), "g", new Set());
      expect(s.shared.map((n) => n.page.id).sort()).toEqual([
        "budget",
        "chores",
        "notes",
        "trip",
      ]);
      expect(s.teamspaces.size).toBe(0);
      expect(s.private).toEqual([]);
    });

    it("keeps a teamspace page under its teamspace for a device that holds it", () => {
      const pages = workspace.pages.filter(
        (p) => p.section === teamspaceSection("house"),
      );
      const s = sidebarSections(buildTree(pages), "m", new Set(["house"]));
      expect(s.teamspaces.get("house")?.map((n) => n.page.id)).toEqual([
        "chores",
        "garden",
      ]);
      expect(s.shared).toEqual([]);
    });
  });
});
