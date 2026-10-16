import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Person } from "@homelab/notes-access-sync-poc-model";
import { connectAs, indexDocName, pageDocName, teamspaceDocName, TestServer, type TestClient } from "./index.ts";

// Teamspaces at the sync boundary (#17): a real server process, and test clients as named people.
describe("teamspaces", () => {
  const server = new TestServer();
  const clients: TestClient[] = [];
  const connect = async (person: Person) => {
    const client = await connectAs(server, person);
    clients.push(client);
    return client;
  };

  let olive: Person; // the workspace owner
  let max: Person;
  let nia: Person;
  let ada: Person;
  let gus: Person; // a guest
  beforeAll(async () => {
    await server.start();
    olive = await server.addPerson("Olive");
    max = await server.addPerson("Max", "member", olive);
    nia = await server.addPerson("Nia", "member", olive);
    ada = await server.addPerson("Ada", "member", olive);
    gus = await server.addPerson("Gus", "guest", olive);
  });
  afterAll(async () => {
    await Promise.all(clients.map((c) => c.close()));
    await server.stop();
  });

  describe("a closed teamspace", () => {
    let house: string;
    let chores: string;
    let kitchen: string;
    beforeAll(async () => {
      const maxDevice = await connect(max);
      house = await maxDevice.createTeamspace("House", "closed", { memberLevel: "edit" });
      await maxDevice.addToTeamspace(house, nia.id);
      chores = await maxDevice.createTeamspacePage(house, "Chores", "Bins on Tuesday");
      kitchen = await maxDevice.createPage("Kitchen", "Descale the kettle", chores);
      await maxDevice.settled();
    });

    it("sends its pages to every member, at the members' default level", async () => {
      const phone = await connect(nia);
      await expect.poll(() => phone.syncAll()).toEqual(
        [indexDocName(nia.id), teamspaceDocName(house), pageDocName(chores), pageDocName(kitchen)].sort(),
      );
      expect(phone.pageTitles()).toEqual(["Chores", "Kitchen"]);
      expect(phone.pageText(kitchen)).toBe("Descale the kettle");
      for (const id of [chores, kitchen]) expect(phone.level(id)).toBe("edit");
      expect(phone.teamspaceSidebar()).toEqual({ House: ["Chores"] });
    });

    it("sends none of its pages to anyone else, the workspace owner included", async () => {
      for (const person of [olive, gus]) {
        const device = await connect(person);
        const received = await device.syncAll();
        expect(received.filter((n) => n.startsWith("page:"))).toEqual([]);
        for (const id of [chores, kitchen]) {
          expect(await device.open(pageDocName(id))).toEqual({ status: "denied", reason: "no-access" });
        }
        expect(device.receivedContent()).not.toContain("Bins on Tuesday");
      }
    });

    it("can't be joined without being added", async () => {
      // A member who isn't in it sees its name, read-only, so their join never reaches the server.
      const outsider = await connect(ada);
      await outsider.syncAll();
      expect(outsider.teamspace(house)).toMatchObject({ name: "House", kind: "closed" });
      expect(await outsider.open(teamspaceDocName(house))).toMatchObject({ status: "synced", scope: "readonly" });
      await outsider.join(house);
      // The workspace owner may edit it (to make it default), but the server refuses her joining.
      const owner = await connect(olive);
      await owner.syncAll();
      await owner.join(house);
      await expect.poll(() => owner.refusals(teamspaceDocName(house))).toEqual(["teamspace-change-refused"]);

      const maxDevice = await connect(max);
      await maxDevice.syncAll();
      expect(Object.keys(maxDevice.teamspace(house)!.members).sort()).toEqual([max.id, nia.id].sort());
      for (const device of [await connect(ada), await connect(olive)]) {
        expect(await device.syncAll()).not.toContain(pageDocName(chores));
      }
    });
  });

  describe("an open teamspace", () => {
    let hall: string;
    let notices: string;
    beforeAll(async () => {
      const maxDevice = await connect(max);
      hall = await maxDevice.createTeamspace("Hall", "open", { memberLevel: "edit", workspaceLevel: "view" });
      notices = await maxDevice.createTeamspacePage(hall, "Notices", "Recycling moved to Friday");
      await maxDevice.settled();
    });

    it("sends its pages to members who haven't joined, readable at the non-member level", async () => {
      const device = await connect(ada);
      await expect.poll(() => device.syncAll()).toContain(pageDocName(notices));
      expect(device.level(notices)).toBe("view");
      expect(await device.open(pageDocName(notices))).toMatchObject({ status: "synced", scope: "readonly" });
      expect(device.pageText(notices)).toBe("Recycling moved to Friday");
      // A guest gets nothing from it.
      const guest = await connect(gus);
      expect(await guest.syncAll()).toEqual([indexDocName(gus.id)]);
    });

    it("can be joined without asking, which brings its pages up to the members' level", async () => {
      const device = await connect(nia);
      await expect.poll(() => device.syncAll()).toContain(pageDocName(notices));
      expect(device.level(notices)).toBe("view");
      await device.join(hall);
      await device.settled();
      await expect.poll(async () => (await device.syncAll(), device.level(notices))).toBe("edit");
      const phone = await connect(nia);
      await expect.poll(() => phone.syncAll()).toContain(pageDocName(notices));
      expect(await phone.open(pageDocName(notices))).toMatchObject({ status: "synced", scope: "read-write" });
      expect(phone.teamspace(hall)?.members[nia.id]).toBe("member");
    });
  });

  describe("default teamspaces", () => {
    it("are joined by every new member, whatever their kind", async () => {
      const owner = await connect(olive);
      const household = await owner.createTeamspace("Household", "closed", { isDefault: true, memberLevel: "edit" });
      const rules = await owner.createTeamspacePage(household, "House rules", "Shoes off");
      // A member's private teamspace, made default afterwards by the workspace owner.
      const maxDevice = await connect(max);
      const garden = await maxDevice.createTeamspace("Garden", "private", { memberLevel: "edit" });
      const beds = await maxDevice.createTeamspacePage(garden, "Raised beds", "Plant garlic");
      await maxDevice.settled();
      await expect.poll(() => owner.syncAll()).toContain(teamspaceDocName(garden));
      await owner.setTeamspace(garden, { isDefault: true });
      await owner.setTeamspace(household, { memberLevel: "comment" });
      await owner.settled();
      await expect.poll(async () => (await maxDevice.syncAll(), maxDevice.teamspace(garden)?.isDefault)).toBe(true);

      const kit = await server.addPerson("Kit", "member", olive);
      const device = await connect(kit);
      await expect.poll(() => device.syncAll()).toEqual(
        expect.arrayContaining([teamspaceDocName(household), teamspaceDocName(garden), pageDocName(rules), pageDocName(beds)]),
      );
      expect(device.teamspace(household)?.members[kit.id]).toBe("member");
      expect(device.teamspace(garden)?.members[kit.id]).toBe("member");
      expect(device.level(rules)).toBe("comment");
      expect(device.level(beds)).toBe("edit");
      // A new guest joins none of them.
      const guest = await server.addPerson("Gia", "guest", olive);
      const guestDevice = await connect(guest);
      expect(await guestDevice.syncAll()).toEqual([indexDocName(guest.id)]);
    });

    it("can only be set by a workspace owner", async () => {
      const maxDevice = await connect(max);
      const shed = await maxDevice.createTeamspace("Shed", "open");
      await maxDevice.setTeamspace(shed, { isDefault: true });
      await expect.poll(() => maxDevice.refusals(teamspaceDocName(shed))).toEqual(["teamspace-change-refused"]);
      const other = await connect(max);
      await other.syncAll();
      expect(other.teamspace(shed)?.isDefault).toBe(false);
    });
  });

  describe("owners and default levels", () => {
    let studio: string;
    let plans: string;
    let budget: string;
    let maxDevice: TestClient;
    beforeAll(async () => {
      maxDevice = await connect(max);
      studio = await maxDevice.createTeamspace("Studio", "closed", { memberLevel: "full" });
      await maxDevice.addToTeamspace(studio, nia.id);
      plans = await maxDevice.createTeamspacePage(studio, "Plans", "Paint the walls");
      budget = await maxDevice.createTeamspacePage(studio, "Budget", "£200");
      await maxDevice.shareWithTeamspace(budget, "view");
      await maxDevice.settled();
    });

    it("owners keep Full access on its pages whatever the members' level and the pages' overrides", async () => {
      const owner = await connect(max);
      const office = await owner.createTeamspace("Office", "closed", { memberLevel: "comment" });
      await owner.addToTeamspace(office, ada.id);
      const desk = await owner.createTeamspacePage(office, "Desk", "Tidy");
      await owner.shareWithTeamspace(desk, "view");
      await owner.share(desk, max.id, "none");
      await owner.settled();
      expect(owner.closedReason(pageDocName(desk))).toBeUndefined();

      const phone = await connect(max);
      await expect.poll(async () => (await phone.syncAll(), phone.level(desk))).toBe("full");
      expect(await phone.open(pageDocName(desk))).toMatchObject({ status: "synced", scope: "read-write" });
      await phone.writeText(desk, "Water the plant");
      await phone.settled();
      const member = await connect(ada);
      await expect.poll(async () => (await member.syncAll(), member.pageText(desk))).toBe("Tidy\nWater the plant");
      expect(member.level(desk)).toBe("view");
    });

    it("the last owner can't leave, but can once there is another owner", async () => {
      await maxDevice.leave(studio);
      await expect.poll(() => maxDevice.refusals(teamspaceDocName(studio))).toEqual(["last-owner"]);
      const phone = await connect(max);
      await expect.poll(() => phone.syncAll()).toContain(teamspaceDocName(studio));
      expect(phone.teamspace(studio)?.members[max.id]).toBe("owner");

      await phone.addToTeamspace(studio, nia.id, "owner");
      await phone.leave(studio);
      await phone.settled();
      const niaDevice = await connect(nia);
      await expect.poll(async () => (await niaDevice.syncAll(), niaDevice.teamspace(studio)?.members)).toEqual({ [nia.id]: "owner" });
    });

    it("a change to the members' default level reaches every member's devices, except on pages that override it", async () => {
      // Nia owns Studio now; Ada joins it as a member.
      const owner = await connect(nia);
      await expect.poll(() => owner.syncAll()).toContain(teamspaceDocName(studio));
      await owner.addToTeamspace(studio, ada.id);
      await owner.settled();
      const member = await connect(ada);
      await expect.poll(async () => (await member.syncAll(), [member.level(plans), member.level(budget)])).toEqual(["full", "view"]);
      await owner.setTeamspace(studio, { memberLevel: "comment" });
      await owner.settled();
      const phone = await connect(ada);
      await expect.poll(async () => (await phone.syncAll(), [phone.level(plans), phone.level(budget)])).toEqual(["comment", "view"]);
      expect(await phone.open(pageDocName(plans))).toMatchObject({ status: "synced", scope: "readonly" });
      // The owner keeps Full access.
      await expect.poll(async () => (await owner.syncAll(), owner.level(plans))).toBe("full");
    });
  });

  describe("a private teamspace", () => {
    let surprise: string;
    let party: string;
    beforeAll(async () => {
      const maxDevice = await connect(max);
      surprise = await maxDevice.createTeamspace("Surprise committee", "private");
      party = await maxDevice.createTeamspacePage(surprise, "Party plan", "Cake for Nia");
      await maxDevice.settled();
    });

    it("never sends its name or pages to a member who isn't in it", async () => {
      const device = await connect(nia);
      const received = await device.syncAll();
      expect(received).not.toContain(teamspaceDocName(surprise));
      expect(await device.open(teamspaceDocName(surprise))).toEqual({ status: "denied", reason: "no-access" });
      expect(await device.open(pageDocName(party))).toEqual({ status: "denied", reason: "no-access" });
      const everything = device.receivedContent();
      for (const trace of ["Surprise committee", "Party plan", "Cake for Nia", surprise, party]) {
        expect(everything).not.toContain(trace);
      }
    });

    it("sends its name, but not its pages, to the workspace owner", async () => {
      const device = await connect(olive);
      await expect.poll(() => device.syncAll()).toContain(teamspaceDocName(surprise));
      expect(device.teamspaceNames()).toContain("Surprise committee");
      expect(device.received()).not.toContain(pageDocName(party));
      expect(await device.open(pageDocName(party))).toEqual({ status: "denied", reason: "no-access" });
      expect(device.receivedContent()).not.toContain("Cake for Nia");
    });

    it("sends nothing to a guest", async () => {
      const device = await connect(gus);
      expect(await device.syncAll()).toEqual([indexDocName(gus.id)]);
      expect(await device.open(teamspaceDocName(surprise))).toEqual({ status: "denied", reason: "no-access" });
    });
  });

  it("keeps teamspaces, their members and their pages' access after a server restart", async () => {
    const before = await connect(max);
    const loft = await before.createTeamspace("Loft", "private", { memberLevel: "edit" });
    const boxes = await before.createTeamspacePage(loft, "Boxes", "Winter coats");
    await before.addToTeamspace(loft, ada.id);
    await before.settled();
    await before.close();
    await server.stop();
    await server.start();
    const member = await connect(ada);
    await expect.poll(() => member.syncAll()).toEqual(expect.arrayContaining([teamspaceDocName(loft), pageDocName(boxes)]));
    expect(member.level(boxes)).toBe("edit");
    const outsider = await connect(nia);
    expect(await outsider.open(pageDocName(boxes))).toEqual({ status: "denied", reason: "no-access" });
    expect(await outsider.open(teamspaceDocName(loft))).toEqual({ status: "denied", reason: "no-access" });
  });
});
