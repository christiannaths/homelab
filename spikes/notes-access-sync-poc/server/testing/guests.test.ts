import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Person } from "@homelab/notes-access-sync-poc-model";
import { connectAs, indexDocName, pageDocName, teamspaceDocName, TestServer, waitFor, type TestClient } from "./index.ts";

// Guests at the sync boundary (#19): a guest's devices receive only what was shared with them and
// its subpages, and a guest creates pages only inside a page they can edit.
describe("guests", () => {
  const server = new TestServer();
  const clients: TestClient[] = [];
  const connect = async (person: Person) => {
    const client = await connectAs(server, person);
    clients.push(client);
    return client;
  };

  let olive: Person; // the workspace owner
  let max: Person;
  let gus: Person; // a guest
  let hana: Person; // another guest
  let maxDevice: TestClient;
  // Max's Private pages: Trip (Gus can edit) > Packing, Recipes (Gus can view), Budget (Gus has
  // Full), Notice (Everyone in the workspace), Diary (not shared). Max's open teamspace "Secret
  // House": Chores (Gus can view) > Bins, and Garden (not shared).
  let trip: string, packing: string, recipes: string, budget: string, notice: string, diary: string;
  let house: string, chores: string, bins: string, garden: string;
  beforeAll(async () => {
    await server.start();
    olive = await server.addPerson("Olive");
    max = await server.addPerson("Max", "member", olive);
    gus = await server.addPerson("Gus", "guest", olive);
    hana = await server.addPerson("Hana", "guest", olive);
    maxDevice = await connect(max);
    trip = await maxDevice.createPage("Trip", "Lisbon in May", null, { access: { [gus.id]: "edit" } });
    packing = await maxDevice.createPage("Packing", "Sun cream", trip);
    recipes = await maxDevice.createPage("Recipes", "Pancakes", null, { access: { [gus.id]: "view" } });
    budget = await maxDevice.createPage("Budget", "Rent first", null, { access: { [gus.id]: "full" } });
    notice = await maxDevice.createPage("Notice", "Office closed Friday");
    await maxDevice.shareWithWorkspace(notice, "edit");
    diary = await maxDevice.createPage("Diary", "Dear diary");
    house = await maxDevice.createTeamspace("Secret House", "open", { memberLevel: "edit", workspaceLevel: "edit" });
    chores = await maxDevice.createTeamspacePage(house, "Chores", "Bins on Tuesday");
    bins = await maxDevice.createPage("Bins", "Blue for paper", chores);
    garden = await maxDevice.createTeamspacePage(house, "Garden", "Plant tulips");
    await maxDevice.share(chores, gus.id, "view");
    await maxDevice.settled();
  });
  afterAll(async () => {
    await Promise.all(clients.map((c) => c.close()));
    await server.stop();
  });

  it("receive only the pages shared with them and their subpages: no teamspaces, no Everyone pages", async () => {
    const device = await connect(gus);
    const expected = [indexDocName(gus.id), ...[trip, packing, recipes, budget, chores, bins].map(pageDocName)].sort();
    await expect.poll(() => device.syncAll()).toEqual(expected);
    expect(device.teamspaceNames()).toEqual([]);
    for (const id of [notice, diary, garden]) {
      expect(await device.open(pageDocName(id))).toEqual({ status: "denied", reason: "no-access" });
    }
    const content = device.receivedContent();
    for (const hidden of ["Secret House", "Office closed Friday", "Notice", "Dear diary", "Garden", "Plant tulips"]) {
      expect(content).not.toContain(hidden);
    }
    // Everything they hold is shared with them, and they have no Private section.
    const sidebar = device.sidebar();
    expect(sidebar.private).toEqual([]);
    expect(sidebar.shared.sort()).toEqual(["Budget", "Chores", "Recipes", "Trip"]);
  });

  it("given a page in a teamspace, receive that page but not the teamspace or its other pages", async () => {
    const device = await connect(gus);
    await expect.poll(() => device.syncAll()).toContain(pageDocName(chores));
    expect(device.pageText(chores)).toBe("Bins on Tuesday");
    expect(device.pageText(bins)).toBe("Blue for paper");
    expect(await device.open(teamspaceDocName(house))).toEqual({ status: "denied", reason: "no-access" });
    expect(await device.open(pageDocName(garden))).toEqual({ status: "denied", reason: "no-access" });
    expect(device.teamspaceSidebar()).toEqual({});
  });

  describe("creating pages", () => {
    it("with Can edit, may create a subpage inside the shared page, which reaches its owner", async () => {
      const device = await connect(gus);
      await expect.poll(() => device.syncAll()).toContain(pageDocName(packing));
      const snacks = await device.createPage("Snacks", "Pastéis de nata", trip);
      const socks = await device.createPage("Socks", "Three pairs", packing);
      await device.settled();
      for (const id of [snacks, socks]) expect(device.refusals(pageDocName(id))).toEqual([]);
      await expect.poll(() => maxDevice.syncAll()).toEqual(expect.arrayContaining([pageDocName(snacks), pageDocName(socks)]));
      expect(maxDevice.pageText(snacks)).toBe("Pastéis de nata");
      await expect.poll(() => device.level(snacks)).toBe("edit");
    });

    it("may not create a top-level page: it never reaches the server", async () => {
      const device = await connect(gus);
      await device.syncAll();
      const id = await device.createPage("My own page", "Mine");
      await expect.poll(() => device.refusals(pageDocName(id))).toEqual(["placement-refused"]);
      expect(await server.refusals()).toContainEqual({ personId: gus.id, documentName: pageDocName(id), reason: "placement-refused" });
      // The server never took it in: asking for that name gives the owner an empty document.
      const owner = await connect(olive);
      await owner.syncAll();
      expect(await owner.open(pageDocName(id))).toMatchObject({ status: "synced" });
      expect(owner.pages().map((p) => p.id)).not.toContain(id);
      expect(owner.receivedContent()).not.toContain("My own page");
      expect(device.level(id)).toBeUndefined();
    });

    it("may not create a subpage inside a page they can only view, in a teamspace or not", async () => {
      const device = await connect(gus);
      await expect.poll(() => device.syncAll()).toContain(pageDocName(chores));
      const ids = [await device.createPage("Dessert", "Cake", recipes), await device.createPage("Mop", "Floors", chores)];
      for (const id of ids) await expect.poll(() => device.refusals(pageDocName(id))).toEqual(["placement-refused"]);
      await maxDevice.syncAll();
      for (const id of ids) expect(maxDevice.received()).not.toContain(pageDocName(id));
    });
  });

  describe("sharing", () => {
    it("with Full access, may share the page, with another guest too", async () => {
      const device = await connect(gus);
      await expect.poll(() => device.syncAll()).toContain(pageDocName(budget));
      await device.share(budget, hana.id, "edit");
      await device.settled();
      expect(device.refusals(pageDocName(budget))).toEqual([]);
      const other = await connect(hana);
      await expect.poll(() => other.syncAll()).toContain(pageDocName(budget));
      expect(other.pageText(budget)).toBe("Rent first");
      expect(other.level(budget)).toBe("edit");
    });

    it("below Full access, may not share it, and the invite never takes effect", async () => {
      const device = await connect(gus);
      await expect.poll(() => device.syncAll()).toContain(pageDocName(trip));
      await device.share(trip, hana.id, "view");
      await expect.poll(() => device.refusals(pageDocName(trip))).toEqual(["access-change-refused"]);
      await device.share(recipes, hana.id, "view");
      await expect.poll(() => device.refusals(pageDocName(recipes))).toEqual(["read-only"]);
      const other = await connect(hana);
      await waitFor(async () => (await other.syncAll()).includes(pageDocName(budget)));
      expect(other.received()).not.toContain(pageDocName(trip));
      expect(other.received()).not.toContain(pageDocName(recipes));
      expect(await other.open(pageDocName(trip))).toEqual({ status: "denied", reason: "no-access" });
    });
  });
});
