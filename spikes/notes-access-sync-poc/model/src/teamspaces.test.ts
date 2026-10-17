import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { documentAccess, pageLevels, type Workspace } from "./access.ts";
import type { Person } from "./people.ts";
import {
  createTeamspace,
  readTeamspace,
  refuseTeamspaceChange,
  setTeamspaceMember,
  type Teamspace,
} from "./teamspaces.ts";
import type { PageMeta } from "./tree.ts";
import {
  metaMap,
  readMeta,
  setTeamspaceAccess,
  teamspaceDocName,
  teamspaceSection,
} from "./workspace.ts";

const people: Person[] = [
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

const teamspace = (id: string, extra: Partial<Teamspace> = {}): Teamspace => ({
  id,
  name: id,
  kind: "closed",
  isDefault: false,
  memberLevel: "edit",
  workspaceLevel: "view",
  members: {},
  ...extra,
});

/** Each person's level on each page, for asserting a whole workspace at once. */
const levels = (ws: Workspace) =>
  Object.fromEntries(
    people.map((p) => [
      p.id,
      Object.fromEntries([...pageLevels(ws, p.id)].sort()),
    ]),
  );

describe("teamspace pages", () => {
  // A closed teamspace: Max owns it, Nia is a member, Olive (the workspace owner) and Gus aren't in it.
  const house = teamspace("house", {
    kind: "closed",
    memberLevel: "edit",
    members: { m: "owner", n: "member" },
  });
  const HOUSE = teamspaceSection("house");
  const workspace: Workspace = {
    people,
    teamspaces: [house],
    pages: [
      page("chores", null, HOUSE),
      page("kitchen", "chores", HOUSE),
      page("bills", null, HOUSE),
    ],
  };

  it("give every member the members' default level, top-level pages and subpages alike (owners: Full)", () => {
    expect(levels(workspace)).toEqual({
      o: {},
      m: { bills: "full", chores: "full", kitchen: "full" },
      n: { bills: "edit", chores: "edit", kitchen: "edit" },
      g: {},
    });
  });

  it("follow a change to the members' default level, except pages that override it, and their subpages", () => {
    const pages = [
      page("chores", null, HOUSE),
      page("kitchen", "chores", HOUSE),
      page("bills", null, HOUSE, { access: { teamspace: "comment" } }),
      page("receipts", "bills", HOUSE),
      page("garden", "chores", HOUSE, { access: { teamspace: "full" } }),
    ];
    const before: Workspace = { people, teamspaces: [house], pages };
    const after: Workspace = {
      people,
      teamspaces: [{ ...house, memberLevel: "view" }],
      pages,
    };
    expect(levels(before).n).toEqual({
      bills: "comment",
      chores: "edit",
      garden: "full",
      kitchen: "edit",
      receipts: "comment",
    });
    expect(levels(after).n).toEqual({
      bills: "comment",
      chores: "view",
      garden: "full",
      kitchen: "view",
      receipts: "comment",
    });
    // Max owns the teamspace, so he keeps Full access throughout.
    expect(levels(after).m).toEqual({
      bills: "full",
      chores: "full",
      garden: "full",
      kitchen: "full",
      receipts: "full",
    });
    expect(levels(after).o).toEqual({});
  });

  it("give teamspace owners Full access, fixed: neither the default level nor a page's overrides lower it", () => {
    const ws: Workspace = {
      people,
      teamspaces: [{ ...house, memberLevel: "view" }],
      pages: [
        page("chores", null, HOUSE),
        page("bills", null, HOUSE, {
          access: { teamspace: "comment", people: { m: "none" } },
        }),
        page("receipts", "bills", HOUSE),
      ],
    };
    expect(levels(ws).m).toEqual({
      bills: "full",
      chores: "full",
      receipts: "full",
    });
    expect(levels(ws).n).toEqual({
      bills: "comment",
      chores: "view",
      receipts: "comment",
    });
  });

  it("of an open teamspace give workspace members who haven't joined the non-member level, but not guests", () => {
    const hall = teamspace("hall", {
      kind: "open",
      memberLevel: "full",
      workspaceLevel: "comment",
      members: { m: "owner" },
    });
    const ws: Workspace = {
      people,
      teamspaces: [hall],
      pages: [
        page("notices", null, teamspaceSection("hall")),
        page("lost", "notices", teamspaceSection("hall")),
      ],
    };
    expect(levels(ws)).toEqual({
      o: { lost: "comment", notices: "comment" },
      m: { lost: "full", notices: "full" },
      n: { lost: "comment", notices: "comment" },
      g: {},
    });
  });

  it("of closed and private teamspaces reach members only, the workspace owner included", () => {
    for (const kind of ["closed", "private"] as const) {
      const ts = teamspace("t", {
        kind,
        workspaceLevel: "edit",
        members: { n: "owner", m: "member" },
      });
      const ws: Workspace = {
        people,
        teamspaces: [ts],
        pages: [page("p", null, teamspaceSection("t"))],
      };
      expect(levels(ws)).toEqual({
        o: {},
        m: { p: "edit" },
        n: { p: "full" },
        g: {},
      });
    }
  });
});

describe("teamspace documents (name, kind, members and defaults)", () => {
  const ws: Workspace = {
    people,
    pages: [],
    teamspaces: [
      teamspace("open", { kind: "open", members: { n: "owner", m: "member" } }),
      teamspace("closed", {
        kind: "closed",
        members: { n: "owner", m: "member" },
      }),
      teamspace("private", {
        kind: "private",
        members: { n: "owner", m: "member" },
      }),
      teamspace("mine", { kind: "private", members: { o: "owner" } }),
    ],
  };
  const access = (personId: string) =>
    Object.fromEntries(
      ["open", "closed", "private", "mine", "new"].map((id) => [
        id,
        documentAccess(ws, personId, teamspaceDocName(id)),
      ]),
    );

  it("reach every workspace member for open and closed teamspaces, but private ones only reach members and workspace owners", () => {
    // Owners can change everything; members join, leave and add people; non-members of an open
    // teamspace may only join it. A teamspace the server doesn't know yet is one being created.
    expect(access("n")).toEqual({
      open: "full",
      closed: "full",
      private: "full",
      mine: "none",
      new: "full",
    });
    expect(access("m")).toEqual({
      open: "edit",
      closed: "edit",
      private: "edit",
      mine: "none",
      new: "full",
    });
    expect(access("o")).toEqual({
      open: "edit",
      closed: "edit",
      private: "edit",
      mine: "full",
      new: "full",
    });
    expect(access("g")).toEqual({
      open: "none",
      closed: "none",
      private: "none",
      mine: "none",
      new: "none",
    });
    const nonMember: Workspace = {
      ...ws,
      people: [...people, { id: "x", name: "Xan", role: "member" }],
    };
    expect(documentAccess(nonMember, "x", teamspaceDocName("open"))).toBe(
      "edit",
    );
    expect(documentAccess(nonMember, "x", teamspaceDocName("closed"))).toBe(
      "view",
    );
    expect(documentAccess(nonMember, "x", teamspaceDocName("private"))).toBe(
      "none",
    );
  });

  it("round-trip through Yjs, and concurrent joins both survive on every device", () => {
    const a = new Y.Doc();
    createTeamspace(a, {
      name: "House",
      kind: "open",
      owner: "m",
      memberLevel: "edit",
      workspaceLevel: "view",
    });
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    setTeamspaceMember(a, "n", "member");
    setTeamspaceMember(b, "o", "member");
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    const expected: Teamspace = {
      id: "t",
      name: "House",
      kind: "open",
      isDefault: false,
      memberLevel: "edit",
      workspaceLevel: "view",
      members: { m: "owner", n: "member", o: "member" },
    };
    expect(readTeamspace("t", a)).toEqual(expected);
    expect(readTeamspace("t", b)).toEqual(expected);
    expect(readTeamspace("t", new Y.Doc())).toBeNull();
  });

  it("let a page override its teamspace's members' level, and restore it", () => {
    const doc = new Y.Doc();
    metaMap(doc).set("createdAt", 1);
    setTeamspaceAccess(doc, "view");
    expect(readMeta("p", doc)?.access).toEqual({ teamspace: "view" });
    setTeamspaceAccess(doc, null);
    expect(readMeta("p", doc)?.access).toBeUndefined();
  });
});

describe("changing a teamspace", () => {
  const [olive, max, nia, gus] = people;
  const refuse = (before: Teamspace | null, after: Teamspace, actor: Person) =>
    refuseTeamspaceChange(people, before, after, actor);
  const withMembers = (
    ts: Teamspace,
    members: Teamspace["members"],
  ): Teamspace => ({ ...ts, members });

  const open = teamspace("t", { kind: "open", members: { m: "owner" } });
  const closed = teamspace("t", { kind: "closed", members: { m: "owner" } });
  const priv = teamspace("t", { kind: "private", members: { m: "owner" } });

  it("lets a workspace member join an open teamspace without asking, but not a closed or private one", () => {
    expect(
      refuse(open, withMembers(open, { m: "owner", n: "member" }), nia),
    ).toBeNull();
    expect(
      refuse(closed, withMembers(closed, { m: "owner", n: "member" }), nia),
    ).toBe("teamspace-change-refused");
    expect(
      refuse(priv, withMembers(priv, { m: "owner", n: "member" }), nia),
    ).toBe("teamspace-change-refused");
    // Nor can anyone join as an owner.
    expect(
      refuse(open, withMembers(open, { m: "owner", n: "owner" }), nia),
    ).toBe("teamspace-change-refused");
  });

  it("lets members add people to a closed or private teamspace, but not non-members, and never guests", () => {
    const team = withMembers(closed, { m: "owner", n: "member" });
    expect(
      refuse(team, withMembers(team, { ...team.members, o: "member" }), nia),
    ).toBeNull();
    expect(
      refuse(priv, withMembers(priv, { m: "owner", n: "member" }), max),
    ).toBeNull();
    expect(
      refuse(closed, withMembers(closed, { m: "owner", n: "member" }), olive),
    ).toBe("teamspace-change-refused");
    expect(
      refuse(closed, withMembers(closed, { m: "owner", g: "member" }), max),
    ).toBe("teamspace-change-refused");
    expect(
      refuse(open, withMembers(open, { m: "owner", g: "member" }), gus),
    ).toBe("teamspace-change-refused");
  });

  it("lets members leave, but not remove anyone else unless they own the teamspace", () => {
    const team = withMembers(closed, { m: "owner", n: "member", o: "member" });
    expect(
      refuse(team, withMembers(team, { m: "owner", o: "member" }), nia),
    ).toBeNull();
    expect(
      refuse(team, withMembers(team, { m: "owner", n: "member" }), nia),
    ).toBe("teamspace-change-refused");
    expect(
      refuse(team, withMembers(team, { m: "owner", n: "member" }), max),
    ).toBeNull();
  });

  it("lets only teamspace owners change its name, kind, default levels and members' roles", () => {
    const team = withMembers(closed, { m: "owner", n: "member" });
    const changes: Teamspace[] = [
      { ...team, name: "Renamed" },
      { ...team, kind: "open" },
      { ...team, memberLevel: "view" },
      { ...team, workspaceLevel: "edit" },
      withMembers(team, { m: "owner", n: "owner" }),
    ];
    for (const after of changes) {
      expect(refuse(team, after, max)).toBeNull();
      expect(refuse(team, after, nia)).toBe("teamspace-change-refused");
    }
  });

  it("lets only a workspace owner make a teamspace default, whatever its kind", () => {
    for (const ts of [open, closed, priv]) {
      expect(refuse(ts, { ...ts, isDefault: true }, olive)).toBeNull();
      expect(refuse(ts, { ...ts, isDefault: true }, max)).toBe(
        "teamspace-change-refused",
      );
    }
  });

  it("never lets the last owner leave or step down", () => {
    const team = withMembers(open, { m: "owner", n: "member" });
    expect(refuse(team, withMembers(team, { n: "member" }), max)).toBe(
      "last-owner",
    );
    expect(
      refuse(team, withMembers(team, { m: "member", n: "member" }), max),
    ).toBe("last-owner");
    const twoOwners = withMembers(open, { m: "owner", n: "owner" });
    expect(
      refuse(twoOwners, withMembers(twoOwners, { n: "owner" }), max),
    ).toBeNull();
  });

  it("lets a member create a teamspace they own, but only a workspace owner create a default one", () => {
    expect(refuse(null, closed, max)).toBeNull();
    expect(
      refuse(null, withMembers(closed, { m: "owner", n: "member" }), max),
    ).toBeNull();
    expect(refuse(null, withMembers(closed, { n: "owner" }), max)).toBe(
      "teamspace-change-refused",
    );
    expect(refuse(null, withMembers(closed, {}), max)).toBe("last-owner");
    expect(refuse(null, { ...closed, isDefault: true }, max)).toBe(
      "teamspace-change-refused",
    );
    expect(
      refuse(
        null,
        { ...withMembers(closed, { o: "owner" }), isDefault: true },
        olive,
      ),
    ).toBeNull();
  });
});
