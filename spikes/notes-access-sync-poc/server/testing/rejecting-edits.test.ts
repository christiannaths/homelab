import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Person } from "@homelab/notes-access-sync-poc-model";
import { connectAs, indexDocName, pageDocName, privateSection, TestServer, waitFor, type TestClient } from "./index.ts";

// Rejecting edits (#18): the server refuses what a device may not write, and the device gets back
// in step by throwing its copy of that document away and syncing it again.
describe("rejecting edits", () => {
  const server = new TestServer();
  const clients: TestClient[] = [];
  const connect = async (person: Person) => {
    const client = await connectAs(server, person);
    clients.push(client);
    return client;
  };

  let max: Person;
  let nia: Person;
  let gus: Person;
  beforeAll(async () => {
    await server.start();
    const olive = await server.addPerson("Olive");
    max = await server.addPerson("Max", "member", olive);
    nia = await server.addPerson("Nia", "member", olive);
    gus = await server.addPerson("Gus", "guest", olive);
  });
  afterAll(async () => {
    await Promise.all(clients.map((c) => c.close()));
    await server.stop();
  });

  /** A page of Max's, shared with Nia at `level`, and Nia's device holding it. */
  async function sharedWithNia(title: string, body: string, level: "view" | "comment" | "edit") {
    const owner = await connect(max);
    const id = await owner.createPage(title, body);
    await owner.share(id, nia.id, level);
    await owner.settled();
    const device = await connect(nia);
    await waitFor(async () => (await device.syncAll()).includes(pageDocName(id)));
    expect(device.level(id)).toBe(level);
    return { id, owner, device };
  }

  describe.each(["view", "comment"] as const)("an edit from a device at Can %s", (level) => {
    let id: string;
    let owner: TestClient;
    let device: TestClient;
    beforeAll(async () => {
      ({ id, owner, device } = await sharedWithNia(`Recipes (${level})`, "Pancakes", level));
      // A modified or buggy client: the app wouldn't offer this edit.
      await device.writeText(id, "Hacked");
    });

    it("is refused, and no other device ever sees it", async () => {
      await expect.poll(() => device.refusals(pageDocName(id))).toEqual(["read-only"]);
      expect(await server.refusals()).toContainEqual({ personId: nia.id, documentName: pageDocName(id), reason: "read-only" });
      const fresh = await connect(max);
      await expect.poll(() => fresh.syncAll()).toContain(pageDocName(id));
      expect(fresh.pageText(id)).toBe("Pancakes");
      expect(owner.pageText(id)).toBe("Pancakes");
    });

    it("leaves the device with the server's copy, still following the page, and it stops resending the edit", async () => {
      await expect.poll(() => device.pageText(id)).toBe("Pancakes");
      await device.settled();
      // Later edits from others still arrive.
      await owner.writeText(id, "Waffles");
      await expect.poll(() => device.pageText(id)).toBe("Pancakes\nWaffles");
      // Reconnecting syncs the whole document again: nothing refused is sent a second time.
      await device.reconnect();
      await device.settled();
      expect(device.refusals(pageDocName(id))).toEqual(["read-only"]);
      expect((await server.refusals()).filter((r) => r.documentName === pageDocName(id))).toHaveLength(1);
      expect(owner.pageText(id)).toBe("Pancakes\nWaffles");
    });
  });

  describe("on a device with Can edit", () => {
    let id: string;
    let owner: TestClient;
    let device: TestClient;
    beforeAll(async () => {
      ({ id, owner, device } = await sharedWithNia("Chores", "Dishes", "edit"));
    });

    it("an access change is refused, and the device returns to the server's access and content", async () => {
      await device.share(id, gus.id, "full");
      await expect.poll(() => device.refusals(pageDocName(id))).toEqual(["access-change-refused"]);
      await expect.poll(() => device.access(id)).toEqual({ people: { [nia.id]: "edit" } });
      await device.settled();
      // Still editable after recovering.
      await device.writeText(id, "Laundry");
      await device.settled();
      await expect.poll(() => owner.pageText(id)).toBe("Dishes\nLaundry");
      expect(owner.access(id)).toEqual({ people: { [nia.id]: "edit" } });
    });

    it("the person's other pages on the same connection stay editable after a refusal", async () => {
      const own = await device.createPage("Nia's notes", "Mine");
      await device.writeText(own, "Still mine");
      await device.settled();
      const phone = await connect(nia);
      await expect.poll(() => phone.syncAll()).toContain(pageDocName(own));
      expect(phone.pageText(own)).toBe("Mine\nStill mine");
      expect(device.refusals(pageDocName(own))).toEqual([]);
    });

    it("an edit made offline after being lowered to Can view is refused on reconnecting, and the device recovers", async () => {
      await device.disconnect();
      await owner.share(id, nia.id, "view");
      await owner.settled();
      await device.writeText(id, "Written offline");
      await device.connect().catch(() => {}); // the refused page reopens after the reconnect's sync
      await expect.poll(() => device.refusals(pageDocName(id))).toEqual(["access-change-refused", "read-only"]);
      await expect.poll(() => device.pageText(id)).toBe("Dishes\nLaundry");
      await device.settled();
      expect(owner.pageText(id)).toBe("Dishes\nLaundry");
      await expect.poll(() => device.level(id)).toBe("view");
    });

    it("a page opened read-only takes edits once the person is raised to Can edit, without reopening", async () => {
      await owner.share(id, nia.id, "edit");
      await owner.settled();
      await expect.poll(() => device.level(id)).toBe("edit");
      await device.writeText(id, "Ironing");
      await device.settled();
      await expect.poll(() => owner.pageText(id)).toBe("Dishes\nLaundry\nIroning");
      expect(device.refusals(pageDocName(id))).toEqual(["access-change-refused", "read-only"]);
    });
  });

  it("a write to the person's own page index is refused, and the index recovers", async () => {
    const device = await connect(nia);
    await device.syncAll();
    const before = device.indexEntries();
    device.forgeIndexEntry("made-up-page", "full");
    await expect.poll(() => device.refusals(indexDocName(nia.id))).toEqual(["read-only"]);
    await expect.poll(() => device.indexEntries()).toEqual(before);
  });

  describe("placing a new page", () => {
    let trip: string;
    let menu: string;
    let owner: TestClient;
    let device: TestClient;
    beforeAll(async () => {
      ({ id: trip, owner, device } = await sharedWithNia("Trip", "Flights", "edit"));
      ({ id: menu } = await sharedWithNia("Menu", "Soup", "view"));
      await waitFor(async () => (await device.syncAll()).includes(pageDocName(menu)));
    });

    it("in someone else's Private section is refused, and never reaches them", async () => {
      const id = await device.createPage("Planted in Max's Private", "Boo", null, { section: privateSection(max.id) });
      await expect.poll(() => device.refusals(pageDocName(id))).toEqual(["placement-refused"]);
      const maxPhone = await connect(max);
      await maxPhone.syncAll();
      expect(maxPhone.received()).not.toContain(pageDocName(id));
      expect(maxPhone.receivedContent()).not.toContain("Planted");
      // The device's copy is the server's: an empty document, so no page in its tree.
      await expect.poll(() => device.pageTitles()).not.toContain("Planted in Max's Private");
    });

    it("under a page the person can only view is refused", async () => {
      const id = await device.createPage("Dessert", "Cake", menu);
      await expect.poll(() => device.refusals(pageDocName(id))).toEqual(["placement-refused"]);
      await owner.syncAll();
      expect(owner.pageTitles()).not.toContain("Dessert");
    });

    it("under a page the person can edit is accepted, and reaches the page's owner", async () => {
      const id = await device.createPage("Hotels", "Book one", trip);
      await device.settled();
      await expect.poll(() => owner.syncAll()).toContain(pageDocName(id));
      expect(owner.pageText(id)).toBe("Book one");
      expect(device.refusals(pageDocName(id))).toEqual([]);
    });

    it("that grants access its creator couldn't grant is refused, and the grant never takes effect", async () => {
      const id = await device.createPage("Car hire", "Pick up at 9", trip, { access: { [gus.id]: "full" } });
      await expect.poll(() => device.refusals(pageDocName(id))).toContain("access-change-refused");
      const guest = await connect(gus);
      expect(await guest.syncAll()).toEqual([indexDocName(gus.id)]);
      expect(await guest.open(pageDocName(id))).toEqual({ status: "denied", reason: "no-access" });
    });
  });

  it("nothing refused was stored: after a restart, no device receives any of it", async () => {
    await Promise.all(clients.splice(0).map((c) => c.close()));
    await server.stop();
    await server.start();
    for (const person of [max, nia, gus]) {
      const device = await connect(person);
      await device.syncAll();
      const everything = device.receivedContent();
      for (const trace of ["Hacked", "Written offline", "Planted", "Dessert", "Car hire", "made-up-page"]) {
        expect(everything).not.toContain(trace);
      }
    }
  });
});
