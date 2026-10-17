import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  teamspaceSection,
  type Person,
} from "@homelab/notes-access-sync-poc-model";
import {
  connectAs,
  indexDocName,
  pageDocName,
  schemaDocName,
  TestServer,
  type TestClient,
} from "./index.ts";

// The sync boundary for losing and regaining access (#21): every way a person can lose a page
// takes it off their connected devices (which delete their copy, as the web app does) and keeps
// it from new ones, and regaining access sends it again.
describe("losing and regaining access", () => {
  const server = new TestServer();
  const clients: TestClient[] = [];
  const connect = async (person: Person) => {
    const client = await connectAs(server, person);
    clients.push(client);
    return client;
  };

  let olive: Person;
  let max: Person;
  let nia: Person;
  let maxDevice: TestClient;
  beforeAll(async () => {
    await server.start();
    olive = await server.addPerson("Olive");
    max = await server.addPerson("Max", "member", olive);
    nia = await server.addPerson("Nia", "member", olive);
    maxDevice = await connect(max);
  });
  afterAll(async () => {
    await Promise.all(clients.map((c) => c.close()));
    await server.stop();
  });

  it("an invite removed: the page and its subpages leave the connected device, and come back when invited again", async () => {
    const trip = await maxDevice.createPage("Trip", "Flights booked");
    const packing = await maxDevice.createPage("Packing list", "Socks", trip);
    await maxDevice.share(trip, nia.id, "edit");
    await maxDevice.settled();
    const laptop = await connect(nia);
    await expect
      .poll(() => laptop.syncAll())
      .toEqual(
        [indexDocName(nia.id), pageDocName(packing), pageDocName(trip)].sort(),
      );

    await maxDevice.share(trip, nia.id, null);
    await maxDevice.settled();
    await expect
      .poll(() => laptop.lost())
      .toEqual([pageDocName(packing), pageDocName(trip)].sort());
    expect(laptop.received()).toEqual([indexDocName(nia.id)]);
    expect(laptop.receivedContent()).not.toMatch(
      /Trip|Packing list|Socks|Flights/,
    );
    expect(laptop.level(trip)).toBeUndefined();

    // Regaining access: the page comes back at the next sync, with what was written meanwhile.
    await maxDevice.writeText(trip, "Hotel booked");
    await maxDevice.share(trip, nia.id, "view");
    await maxDevice.settled();
    await expect
      .poll(() => laptop.syncAll())
      .toEqual(
        [indexDocName(nia.id), pageDocName(packing), pageDocName(trip)].sort(),
      );
    expect(laptop.pageText(trip)).toBe("Flights booked\nHotel booked");
    expect(laptop.level(packing)).toBe("view");
  });

  it("a level lowered to No access: a device that was offline deletes the page when it reconnects", async () => {
    const plan = await maxDevice.createPage(
      "Garden plan",
      "Tomatoes by the fence",
    );
    await maxDevice.share(plan, nia.id, "edit");
    await maxDevice.settled();
    const phone = await connect(nia);
    await expect.poll(() => phone.syncAll()).toContain(pageDocName(plan));

    await phone.disconnect();
    await maxDevice.share(plan, nia.id, "none");
    await maxDevice.settled();
    expect(phone.received()).toContain(pageDocName(plan)); // offline: nothing changes until the next sync
    await phone.connect();
    expect(phone.lost()).toContain(pageDocName(plan));
    expect(phone.receivedContent()).not.toContain("Garden plan");
  });

  describe("moves", () => {
    let diary: string;
    beforeAll(async () => {
      diary = await maxDevice.createPage("Diary", "Dear diary");
      await maxDevice.settled();
    });

    it("moved under a parent she can't open, with an invite of its own: it stays, at the top of her Shared section", async () => {
      const recipes = await maxDevice.createPage("Recipes", "Pancakes");
      await maxDevice.share(recipes, nia.id, "edit");
      await maxDevice.settled();
      const device = await connect(nia);
      await expect.poll(() => device.syncAll()).toContain(pageDocName(recipes));

      await maxDevice.move(recipes, diary);
      await maxDevice.settled();
      await expect
        .poll(() => device.tree().byId.get(recipes)?.parentHidden)
        .toBe(true);
      expect(device.sidebar().shared).toContain("Recipes");
      expect(device.lost()).toEqual([]);
      const fresh = await connect(nia);
      await expect.poll(() => fresh.syncAll()).toContain(pageDocName(recipes));
      expect(fresh.receivedContent()).not.toMatch(/Diary|Dear diary/);
    });

    it("moved under a parent she can't open, with access only inherited: it leaves her devices", async () => {
      const house = await maxDevice.createPage("House", "Keys under the mat");
      const bills = await maxDevice.createPage("Bills", "Gas, water", house);
      await maxDevice.share(house, nia.id, "edit");
      await maxDevice.settled();
      const device = await connect(nia);
      await expect.poll(() => device.syncAll()).toContain(pageDocName(bills));

      await maxDevice.move(bills, diary);
      await maxDevice.settled();
      await expect.poll(() => device.lost()).toEqual([pageDocName(bills)]);
      const fresh = await connect(nia);
      await expect.poll(() => fresh.syncAll()).toContain(pageDocName(house));
      expect(fresh.received()).not.toContain(pageDocName(bills));
    });

    it("moved into a teamspace she isn't in: she loses what she only inherited, and its members get it", async () => {
      const ops = await maxDevice.createTeamspace("Ops", "closed", {
        memberLevel: "edit",
      });
      await maxDevice.addToTeamspace(ops, olive.id);
      const office = await maxDevice.createPage("Office", "Door code");
      const supplies = await maxDevice.createPage(
        "Supplies",
        "Paper, toner",
        office,
      );
      const wifi = await maxDevice.createPage("Office wifi", "Ask Max", office);
      await maxDevice.share(office, nia.id, "edit");
      await maxDevice.share(wifi, nia.id, "view"); // an invite of its own
      await maxDevice.settled();
      const niasDevice = await connect(nia);
      const olivesDevice = await connect(olive);
      await expect
        .poll(() => niasDevice.syncAll())
        .toEqual(
          expect.arrayContaining([pageDocName(supplies), pageDocName(wifi)]),
        );

      await maxDevice.move(supplies, null, { section: teamspaceSection(ops) });
      await maxDevice.move(wifi, null, { section: teamspaceSection(ops) });
      await maxDevice.settled();
      await expect
        .poll(() => niasDevice.lost())
        .toEqual([pageDocName(supplies)]);
      // Her own invite still counts in the teamspace: the page stays, now top-level, shown under
      // the (closed, so visible to her by name) teamspace.
      expect(niasDevice.received()).toContain(pageDocName(wifi));
      await expect
        .poll(() => niasDevice.teamspaceSidebar())
        .toEqual({ Ops: ["Office wifi"] });
      expect(niasDevice.sidebar().shared).not.toContain("Supplies");
      await expect
        .poll(() => olivesDevice.syncAll())
        .toEqual(
          expect.arrayContaining([pageDocName(supplies), pageDocName(wifi)]),
        );
      expect(olivesDevice.level(supplies)).toBe("edit");
    });

    it("moved to Private: everyone else loses it, including people with an invite on the page itself", async () => {
      const party = await maxDevice.createPage("Party", "Saturday");
      const guests = await maxDevice.createPage(
        "Guest list",
        "Ana, Ben",
        party,
      );
      await maxDevice.share(party, nia.id, "edit");
      await maxDevice.share(guests, olive.id, "view");
      await maxDevice.settled();
      const niasDevice = await connect(nia);
      const olivesDevice = await connect(olive);
      await expect
        .poll(() => niasDevice.syncAll())
        .toContain(pageDocName(guests));
      await expect
        .poll(() => olivesDevice.syncAll())
        .toContain(pageDocName(guests));

      await maxDevice.move(guests, null);
      await maxDevice.settled();
      expect(maxDevice.access(guests)).toBeUndefined();
      await expect.poll(() => niasDevice.lost()).toContain(pageDocName(guests));
      await expect
        .poll(() => olivesDevice.lost())
        .toContain(pageDocName(guests));
      expect(niasDevice.received()).toContain(pageDocName(party));
      expect(maxDevice.sidebar().private).toContain("Guest list");
    });
  });

  it("a database lost: its rows and its properties leave the device; a single row lost takes the properties with it", async () => {
    const pia = await server.addPerson("Pia", "member", olive);
    const db = await maxDevice.createDatabase("Chores", { Points: "number" });
    const dishes = await maxDevice.addRow(db.id, "Dishes", {
      [db.properties.Points]: 3,
    });
    const bins = await maxDevice.addRow(db.id, "Bins", {
      [db.properties.Points]: 1,
    });
    await maxDevice.share(db.id, nia.id, "edit-content");
    await maxDevice.share(bins, pia.id, "view");
    await maxDevice.settled();
    const niasDevice = await connect(nia);
    const piasDevice = await connect(pia);
    await expect
      .poll(() => niasDevice.syncAll())
      .toEqual(
        expect.arrayContaining([schemaDocName(db.id), pageDocName(dishes)]),
      );
    await expect
      .poll(() => piasDevice.syncAll())
      .toEqual(
        expect.arrayContaining([pageDocName(bins), schemaDocName(db.id)]),
      );
    expect(piasDevice.received().filter((n) => n.startsWith("page:"))).toEqual([
      pageDocName(bins),
    ]);

    await maxDevice.share(db.id, nia.id, null);
    await maxDevice.share(bins, pia.id, null);
    await maxDevice.settled();
    await expect
      .poll(() => niasDevice.lost())
      .toEqual(
        expect.arrayContaining([
          pageDocName(db.id),
          pageDocName(dishes),
          pageDocName(bins),
          schemaDocName(db.id),
        ]),
      );
    await expect
      .poll(() => piasDevice.lost())
      .toEqual([pageDocName(bins), schemaDocName(db.id)].sort());
    expect(
      piasDevice.received().filter((n) => !n.startsWith("teamspace:")),
    ).toEqual([indexDocName(pia.id)]);
    expect(niasDevice.receivedContent()).not.toMatch(/Chores|Dishes|Points/);
  });

  it("a level changed while connected takes effect on the open connection, both ways", async () => {
    const notes = await maxDevice.createPage("Meeting notes", "Agenda");
    await maxDevice.share(notes, nia.id, "view");
    await maxDevice.settled();
    const device = await connect(nia);
    await expect.poll(() => device.syncAll()).toContain(pageDocName(notes));

    // Upgraded to Can edit: her edit on the already-open (read-only) connection is applied.
    await maxDevice.share(notes, nia.id, "edit");
    await maxDevice.settled();
    await expect.poll(() => device.level(notes)).toBe("edit");
    await device.writeText(notes, "Nia: action items");
    await device.settled();
    await expect
      .poll(() => maxDevice.pageText(notes))
      .toBe("Agenda\nNia: action items");

    // Lowered to Can view: her next edit on the same connection is not.
    await maxDevice.share(notes, nia.id, "view");
    await maxDevice.settled();
    await expect.poll(() => device.level(notes)).toBe("view");
    await device.writeText(notes, "Nia: sneaky edit");
    await maxDevice.writeText(notes, "Max: done");
    await maxDevice.settled();
    await expect.poll(() => device.pageText(notes)).toContain("Max: done");
    expect(maxDevice.pageText(notes)).not.toContain("sneaky");
  });

  it("a removed person's clients are refused, and their connected devices lose every page and their index", async () => {
    const gus = await server.addPerson("Gus", "member", olive);
    const shared = await maxDevice.createPage("Team rota", "Mondays: Gus");
    await maxDevice.shareWithWorkspace(shared, "edit");
    await maxDevice.settled();
    const gusDevice = await connect(gus);
    const own = await gusDevice.createPage("Gus's notes", "Mine");
    await expect
      .poll(() => gusDevice.syncAll())
      .toEqual(expect.arrayContaining([pageDocName(shared), pageDocName(own)]));

    await expect(server.removePerson(gus, max)).rejects.toThrow(/403/);
    await server.removePerson(gus, olive);
    expect((await server.people()).map((p) => p.name)).not.toContain("Gus");

    await expect
      .poll(() => gusDevice.lost())
      .toEqual(
        expect.arrayContaining([
          indexDocName(gus.id),
          pageDocName(shared),
          pageDocName(own),
        ]),
      );
    expect(gusDevice.received()).toEqual([]);
    const fresh = await connect(gus);
    expect(await fresh.syncAll()).toEqual([]);
    expect(fresh.denied()).toEqual([indexDocName(gus.id)]);
    expect(await fresh.open(pageDocName(shared))).toEqual({
      status: "denied",
      reason: "no-access",
    });
    expect(
      (await server.connections()).filter((c) => c.personId === gus.id),
    ).toEqual([]);
  });
});
