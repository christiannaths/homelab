import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { pageLevels, type Workspace } from "./access.ts";
import type { Person } from "./people.ts";
import { buildTree } from "./tree.ts";
import {
  createPage, movePage, movesToPrivate, privateSection, readMeta, setPersonAccess, setWorkspaceAccess,
  type PageDocs,
} from "./workspace.ts";

const people: Person[] = [
  { id: "max", name: "Max", role: "member" },
  { id: "nia", name: "Nia", role: "member" },
  { id: "olive", name: "Olive", role: "owner" },
];
const MAX = privateSection("max");
const NIA = privateSection("nia");

/** A device: the page documents it holds, one Y.Doc per page. */
class Device implements PageDocs {
  readonly docs = new Map<string, Y.Doc>();
  get(id: string) {
    return this.docs.get(id);
  }
  create(id: string) {
    const doc = new Y.Doc();
    this.docs.set(id, doc);
    return doc;
  }
  pages() {
    return [...this.docs].flatMap(([id, d]) => readMeta(id, d) ?? []);
  }
  tree() {
    return buildTree(this.pages());
  }
  /** One person's levels, as the server would work them out from this device's documents. */
  levels(personId: string): Record<string, string> {
    const ws: Workspace = { people, pages: this.pages() };
    return Object.fromEntries([...pageLevels(ws, personId)].sort());
  }
}

function sync(x: Device, y: Device) {
  for (const id of new Set([...x.docs.keys(), ...y.docs.keys()])) {
    const a = x.get(id) ?? x.create(id);
    const b = y.get(id) ?? y.create(id);
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
  }
}

// Story 44: moving a page to Private removes everyone else's access to it.
describe("moving a page to Private", () => {
  it("removes the invites and general access set on the page itself, in the same change as the move", () => {
    const device = new Device();
    const trip = createPage(device, device.tree(), { title: "Trip", section: MAX });
    const budget = createPage(device, device.tree(), { title: "Budget", parentId: trip });
    setPersonAccess(device.get(trip)!, "nia", "edit");
    setPersonAccess(device.get(budget)!, "olive", "view");
    setWorkspaceAccess(device.get(budget)!, "comment");
    expect(device.levels("nia")).toEqual({ [budget]: "edit", [trip]: "edit" });

    const updates: Uint8Array[] = [];
    device.get(budget)!.on("update", (u: Uint8Array) => updates.push(u));
    expect(movesToPrivate(device.tree(), budget, null, MAX)).toBe(true);
    expect(movePage(device, device.tree(), budget, null, 0, MAX)).toBe(true);

    expect(updates).toHaveLength(1);
    expect(readMeta(budget, device.get(budget)!)).toMatchObject({ parentId: null, section: MAX, access: undefined });
    expect(device.levels("nia")).toEqual({ [trip]: "edit" });
    expect(device.levels("olive")).toEqual({});
    expect(device.levels("max")).toEqual({ [budget]: "full", [trip]: "full" });
  });

  it("also applies to a page moved into Private from someone else's section", () => {
    const device = new Device();
    const plan = createPage(device, device.tree(), { title: "Plan", section: NIA });
    setPersonAccess(device.get(plan)!, "max", "full");
    setPersonAccess(device.get(plan)!, "olive", "edit");
    expect(movesToPrivate(device.tree(), plan, null, MAX)).toBe(true);
    movePage(device, device.tree(), plan, null, 0, MAX);
    expect(readMeta(plan, device.get(plan)!)?.access).toBeUndefined();
    expect(device.levels("nia")).toEqual({});
    expect(device.levels("olive")).toEqual({});
  });

  it("keeps the access when a shared page is only reordered within Private, or moved under another page", () => {
    const device = new Device();
    const trip = createPage(device, device.tree(), { title: "Trip", section: MAX });
    const recipes = createPage(device, device.tree(), { title: "Recipes", section: MAX });
    setPersonAccess(device.get(trip)!, "nia", "edit");

    expect(movesToPrivate(device.tree(), trip, null, MAX)).toBe(false);
    movePage(device, device.tree(), trip, null, 1, MAX);
    expect(readMeta(trip, device.get(trip)!)?.access).toEqual({ people: { nia: "edit" } });

    // Under another Private page: still the page's own invite, so Nia keeps it (below a hidden parent).
    expect(movesToPrivate(device.tree(), trip, recipes, undefined)).toBe(false);
    movePage(device, device.tree(), trip, recipes, 0);
    expect(device.levels("nia")).toEqual({ [trip]: "edit" });
  });

  it("an invite added offline while the page moves to Private survives the merge (it was never seen by the move)", () => {
    const max = new Device();
    const trip = createPage(max, max.tree(), { title: "Trip", section: MAX });
    const budget = createPage(max, max.tree(), { title: "Budget", parentId: trip });
    setPersonAccess(max.get(budget)!, "nia", "edit");
    const laptop = new Device();
    sync(max, laptop);

    movePage(max, max.tree(), budget, null, 0, MAX);
    setPersonAccess(laptop.get(budget)!, "olive", "view");
    sync(max, laptop);

    // The move removed only the entries it saw; Olive's later invite is a new decision.
    for (const d of [max, laptop]) {
      expect(readMeta(budget, d.get(budget)!)?.access).toEqual({ people: { olive: "view" } });
      expect(d.levels("nia")).toEqual({});
    }
  });
});
