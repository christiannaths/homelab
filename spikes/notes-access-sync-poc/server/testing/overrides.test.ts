import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Person } from "@homelab/notes-access-sync-poc-model";
import {
  connectAs,
  indexDocName,
  pageDocName,
  TestServer,
  type TestClient,
} from "./index.ts";

/** Polls until `ready` is true (expect.poll only works inside tests, not in beforeAll). */
async function until(
  ready: () => Promise<boolean>,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await ready())) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 50));
  }
}

// The sync boundary for overrides: what reaches a person's devices when a subpage expands,
// restricts or restores what it inherits, and when they can open a page but not its parent.
describe("overriding inherited access", () => {
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
  beforeAll(async () => {
    await server.start();
    olive = await server.addPerson("Olive");
    max = await server.addPerson("Max", "member", olive);
    nia = await server.addPerson("Nia", "member", olive);
  });
  afterAll(async () => {
    await Promise.all(clients.map((c) => c.close()));
    await server.stop();
  });

  describe("restricting a person to No access on a subpage, then restoring", () => {
    let maxDevice: TestClient;
    let niasLaptop: TestClient;
    let trip: string;
    let packing: string;
    let shoes: string;
    beforeAll(async () => {
      maxDevice = await connect(max);
      trip = await maxDevice.createPage("Trip", "Flights booked");
      packing = await maxDevice.createPage("Packing list", "Socks", trip);
      shoes = await maxDevice.createPage("Hiking shoes", "Boots", packing);
      await maxDevice.share(trip, nia.id, "edit");
      await maxDevice.settled();
      // Nia's laptop holds all three before the restriction, and stays connected through it.
      niasLaptop = await connect(nia);
      await until(async () => (await niasLaptop.syncAll()).length === 4);
    });

    it("stops the subpage and everything under it from reaching her devices, title included", async () => {
      await maxDevice.share(packing, nia.id, "none");
      await maxDevice.settled();

      const phone = await connect(nia);
      await expect
        .poll(() => phone.syncAll())
        .toEqual([indexDocName(nia.id), pageDocName(trip)].toSorted());
      const everything = phone.receivedContent();
      for (const trace of ["Packing list", "Hiking shoes", "Socks", "Boots"])
        expect(everything).not.toContain(trace);
      expect(await phone.open(pageDocName(packing))).toEqual({
        status: "denied",
        reason: "no-access",
      });
      expect(await phone.open(pageDocName(shoes))).toEqual({
        status: "denied",
        reason: "no-access",
      });
      expect(phone.level(trip)).toBe("edit");

      // The connected laptop is cut off from both documents, so later edits don't reach it.
      await expect
        .poll(() => niasLaptop.closedReason(pageDocName(packing)))
        .toBe("access-revoked");
      await expect
        .poll(() => niasLaptop.closedReason(pageDocName(shoes)))
        .toBe("access-revoked");
      expect(niasLaptop.closedReason(pageDocName(trip))).toBeUndefined();
      await maxDevice.rename(shoes, "Trail runners");
      await maxDevice.settled();
      await maxDevice.writeText(trip, "Hotel booked");
      await maxDevice.settled();
      await expect
        .poll(() => niasLaptop.pageText(trip))
        .toBe("Flights booked\nHotel booked");
      expect(niasLaptop.receivedContent()).not.toContain("Trail runners");
    });

    it("leaves everyone else's inherited access alone", async () => {
      await maxDevice.share(trip, olive.id, "view");
      await maxDevice.settled();
      const device = await connect(olive);
      await expect
        .poll(() => device.syncAll())
        .toEqual(
          [
            indexDocName(olive.id),
            pageDocName(trip),
            pageDocName(packing),
            pageDocName(shoes),
          ].toSorted(),
        );
    });

    it("sends it to her again on Restore inherited access, on a new device and on the connected one", async () => {
      await maxDevice.share(packing, nia.id, null);
      await maxDevice.settled();

      const tablet = await connect(nia);
      await expect
        .poll(() => tablet.syncAll())
        .toEqual(
          [
            indexDocName(nia.id),
            pageDocName(trip),
            pageDocName(packing),
            pageDocName(shoes),
          ].toSorted(),
        );
      expect(tablet.pageTitles()).toEqual([
        "Trip",
        "Packing list",
        "Trail runners",
      ]);
      expect(tablet.level(shoes)).toBe("edit");

      await expect
        .poll(async () => (await niasLaptop.syncAll(), niasLaptop.pageTitles()))
        .toEqual(["Trip", "Packing list", "Trail runners"]);
      expect(niasLaptop.pageText(shoes)).toBe("Boots");
    });
  });

  describe("a page reachable without its parent", () => {
    let maxDevice: TestClient;
    let garden: string;
    let beds: string;
    let tomatoes: string;
    let seeds: string;
    beforeAll(async () => {
      maxDevice = await connect(max);
      garden = await maxDevice.createPage("Secret garden", "Behind the shed");
      beds = await maxDevice.createPage("Raised beds", "Cedar", garden);
      tomatoes = await maxDevice.createPage("Tomatoes", "Water daily", beds);
      seeds = await maxDevice.createPage("Seed list", "Basil", tomatoes);
      await maxDevice.share(tomatoes, nia.id, "edit");
      await maxDevice.settled();
    });

    it("arrives at the top of the Shared section with its subpages, and no document or title of the hidden parents", async () => {
      const device = await connect(nia);
      await expect.poll(() => device.syncAll()).toContain(pageDocName(seeds));
      expect(
        device
          .received()
          .filter((n) => [garden, beds].some((id) => n.includes(id))),
      ).toEqual([]);
      expect(device.sidebar().shared).toContain("Tomatoes");
      expect(device.tree().byId.get(tomatoes)).toMatchObject({
        parentId: null,
        parentHidden: true,
        depth: 0,
      });
      expect(device.tree().byId.get(seeds)).toMatchObject({
        parentId: tomatoes,
        depth: 1,
      });
      const everything = device.receivedContent();
      for (const trace of [
        "Secret garden",
        "Raised beds",
        "Behind the shed",
        "Cedar",
      ]) {
        expect(everything).not.toContain(trace);
      }
      expect(await device.open(pageDocName(beds))).toEqual({
        status: "denied",
        reason: "no-access",
      });
    });

    it("stays when the parent it was shared through is unshared, and the parent leaves", async () => {
      // Shared from the top, with its own invite further down (Notion keeps such invites).
      await maxDevice.share(garden, nia.id, "view");
      await maxDevice.settled();
      const device = await connect(nia);
      await expect.poll(() => device.syncAll()).toContain(pageDocName(garden));
      expect(device.tree().byId.get(tomatoes)?.parentHidden).toBe(false);

      await maxDevice.share(garden, nia.id, null);
      await maxDevice.settled();
      const fresh = await connect(nia);
      await expect
        .poll(() => fresh.syncAll())
        .not.toContain(pageDocName(garden));
      expect(fresh.received()).toEqual(
        expect.arrayContaining([pageDocName(tomatoes), pageDocName(seeds)]),
      );
      expect(fresh.receivedContent()).not.toContain("Secret garden");
      expect(fresh.tree().byId.get(tomatoes)?.parentHidden).toBe(true);
      await expect
        .poll(() => device.closedReason(pageDocName(garden)))
        .toBe("access-revoked");
    });
  });
});
