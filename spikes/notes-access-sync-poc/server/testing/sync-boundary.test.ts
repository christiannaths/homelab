import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Person } from "@homelab/notes-access-sync-poc-model";
import { connectAs, indexDocName, pageDocName, TestServer, type TestClient } from "./index.ts";

// The sync boundary: a real server process, and test clients connecting as named people.
describe("sync boundary", () => {
  const server = new TestServer();
  const clients: TestClient[] = [];
  const connect = async (...args: Parameters<typeof connectAs>) => {
    const client = await connectAs(...args);
    clients.push(client);
    return client;
  };

  let olive: Person;
  let max: Person;
  let nia: Person;
  let gus: Person;
  beforeAll(async () => {
    await server.start();
    olive = await server.addPerson("Olive");
    max = await server.addPerson("Max", "member", olive);
    nia = await server.addPerson("Nia", "member", olive);
    gus = await server.addPerson("Gus", "guest", olive);
  });
  afterAll(async () => {
    await Promise.all(clients.map((c) => c.close()));
    await server.stop();
  });

  describe("a member's Private pages", () => {
    let diary: string;
    let secret: string;
    beforeAll(async () => {
      const laptop = await connect(server, max);
      diary = await laptop.createPage("Max's diary", "Dear diary");
      secret = await laptop.createPage("Secret plans", "Surprise party", diary);
      await laptop.settled();
    });

    it("reach the member's other devices, with the sidebar built from the received pages", async () => {
      const phone = await connect(server, max);
      await expect.poll(() => phone.syncAll()).toEqual(
        [indexDocName(max.id), pageDocName(diary), pageDocName(secret)].sort(),
      );
      expect(phone.pageTitles()).toEqual(["Max's diary", "Secret plans"]);
      expect(phone.sidebar()).toEqual({ shared: [], private: ["Max's diary"] });
      expect(phone.pageText(secret)).toBe("Surprise party");
    });

    it("never reach anyone else's device: no document, and no title in anything they receive", async () => {
      for (const person of [olive, nia, gus]) {
        const device = await connect(server, person);
        const received = await device.syncAll();
        expect(received.filter((n) => n.startsWith("page:"))).toEqual([]);
        expect(device.pageTitles()).toEqual([]);
        const everything = device.receivedContent();
        for (const trace of ["Max's diary", "Secret plans", diary, secret]) expect(everything).not.toContain(trace);
      }
    });

    it("are refused when someone else asks for them by name, as is their page index", async () => {
      const device = await connect(server, olive);
      expect(await device.open(pageDocName(diary))).toEqual({ status: "denied", reason: "no-access" });
      expect(await device.open(pageDocName(secret))).toEqual({ status: "denied", reason: "no-access" });
      expect(await device.open(indexDocName(max.id))).toEqual({ status: "denied", reason: "no-access" });
      // Checked per document on the same connection: her own index still opens.
      expect(await device.open(indexDocName(olive.id))).toMatchObject({ status: "synced", scope: "readonly" });
      expect(device.denied()).toEqual([indexDocName(max.id), pageDocName(diary), pageDocName(secret)].sort());
      expect(device.receivedContent()).not.toContain("Dear diary");
    });
  });

  describe("sharing a Private page", () => {
    let trip: string;
    let packing: string;
    let shoes: string;
    let journal: string;
    let maxDevice: TestClient;
    beforeAll(async () => {
      maxDevice = await connect(server, max);
      trip = await maxDevice.createPage("Trip", "Flights booked");
      packing = await maxDevice.createPage("Packing", "Socks", trip);
      shoes = await maxDevice.createPage("Shoes", "Boots", packing);
      journal = await maxDevice.createPage("Max's journal", "Not for Nia");
      await maxDevice.settled();
    });

    it("at Can view sends the page and its subpages to the invitee, read-only, and nothing else from the sharer's Private section", async () => {
      const before = await connect(server, nia);
      expect(await before.syncAll()).toEqual([indexDocName(nia.id)]);

      await maxDevice.share(trip, nia.id, "view");
      await maxDevice.settled();

      const phone = await connect(server, nia);
      await expect.poll(() => phone.syncAll()).toEqual(
        [indexDocName(nia.id), pageDocName(trip), pageDocName(packing), pageDocName(shoes)].sort(),
      );
      expect(phone.pageTitles()).toEqual(["Trip", "Packing", "Shoes"]);
      expect(phone.pageText(shoes)).toBe("Boots");
      for (const id of [trip, packing, shoes]) {
        expect(await phone.open(pageDocName(id))).toMatchObject({ status: "synced", scope: "readonly" });
        expect(phone.level(id)).toBe("view");
      }
      const everything = phone.receivedContent();
      for (const trace of ["Max's journal", "Not for Nia", journal]) expect(everything).not.toContain(trace);
      expect(await phone.open(pageDocName(journal))).toEqual({ status: "denied", reason: "no-access" });
      // Nobody else got it.
      const olivesDevice = await connect(server, olive);
      expect(await olivesDevice.syncAll()).toEqual([indexDocName(olive.id)]);
    });

    it("appears in the sharer's Shared section and in the recipient's", async () => {
      const phone = await connect(server, nia);
      await expect.poll(() => phone.syncAll()).toContain(pageDocName(trip));
      expect(phone.sidebar()).toEqual({ shared: ["Trip"], private: [] });
      const maxPhone = await connect(server, max);
      await expect.poll(async () => (await maxPhone.syncAll(), maxPhone.sidebar().shared)).toEqual(["Trip"]);
      // His unshared pages (the journal, and the diary from earlier) stay in Private.
      expect(maxPhone.sidebar().private.sort()).toEqual(["Max's diary", "Max's journal"]);
    });
  });

  describe("general access", () => {
    it("Everyone in the workspace sends the page to every member and owner, but not to guests", async () => {
      const device = await connect(server, nia);
      const notice = await device.createPage("House rules", "Shoes off");
      await device.shareWithWorkspace(notice, "comment");
      await device.settled();
      for (const person of [olive, max]) {
        const other = await connect(server, person);
        await expect.poll(() => other.syncAll()).toContain(pageDocName(notice));
        expect(other.level(notice)).toBe("comment");
        expect(other.pageText(notice)).toBe("Shoes off");
      }
      const guest = await connect(server, gus);
      expect(await guest.syncAll()).toEqual([indexDocName(gus.id)]);
      expect(await guest.open(pageDocName(notice))).toEqual({ status: "denied", reason: "no-access" });
    });
  });

  describe("changing access", () => {
    let plan: string;
    let sharer: TestClient;
    beforeAll(async () => {
      sharer = await connect(server, olive);
      plan = await sharer.createPage("Garden plan", "Tomatoes");
      await sharer.share(plan, max.id, "edit");
      await sharer.share(plan, nia.id, "full");
      await sharer.settled();
    });

    it("is refused from someone with Can edit, though their other edits are kept", async () => {
      const editor = await connect(server, max);
      await expect.poll(() => editor.syncAll()).toContain(pageDocName(plan));
      expect(editor.level(plan)).toBe("edit");
      await editor.writeText(plan, "Basil");
      await editor.settled();
      await expect.poll(() => sharer.pageText(plan)).toBe("Tomatoes\nBasil");

      await editor.share(plan, gus.id, "full");
      await expect.poll(() => editor.closedReason(pageDocName(plan))).toBe("access-change-refused");
      const guest = await connect(server, gus);
      expect(await guest.syncAll()).toEqual([indexDocName(gus.id)]);
      expect(await guest.open(pageDocName(plan))).toEqual({ status: "denied", reason: "no-access" });
      expect(sharer.access(plan)).toEqual({ people: { [max.id]: "edit", [nia.id]: "full" } });
    });

    it("is accepted from someone invited with Full access", async () => {
      const full = await connect(server, nia);
      await expect.poll(() => full.syncAll()).toContain(pageDocName(plan));
      expect(full.level(plan)).toBe("full");
      await full.share(plan, gus.id, "view");
      await full.settled();
      const guest = await connect(server, gus);
      await expect.poll(() => guest.syncAll()).toContain(pageDocName(plan));
      expect(guest.sidebar()).toEqual({ shared: ["Garden plan"], private: [] });
    });
  });

  it("opens a person's own page index read-only, so only the server writes it", async () => {
    const device = await connect(server, nia);
    const index = await device.open(indexDocName(nia.id));
    expect(index).toMatchObject({ status: "synced", scope: "readonly" });
  });

  it("lets a guest open no new top-level page", async () => {
    const device = await connect(server, gus);
    expect(await device.open(pageDocName("guest-made-this"))).toEqual({ status: "denied", reason: "no-access" });
  });

  it("knows which person each connection belongs to", async () => {
    const device = await connect(server, gus);
    await device.syncAll();
    expect(await server.connections()).toContainEqual({ personId: gus.id, documentName: indexDocName(gus.id) });
  });

  it("refuses a connection from someone who is not in the workspace", async () => {
    const stranger = await connect(server, { id: "stranger", name: "Stranger", role: "member" });
    expect(await stranger.open(indexDocName("stranger"))).toEqual({ status: "denied", reason: "no-access" });
    expect(await stranger.open("workspace:default")).toEqual({ status: "denied", reason: "no-access" });
    expect(stranger.received()).toEqual([]);
  });

  it("keeps each person's pages after a server restart", async () => {
    const before = await connect(server, nia);
    const id = await before.createPage("Nia's list");
    await before.settled();
    await before.close();
    await server.stop();
    await server.start();
    const after = await connect(server, nia);
    await expect.poll(() => after.syncAll()).toContain(pageDocName(id));
    expect(after.pageTitles()).toContain("Nia's list");
    const other = await connect(server, olive);
    expect(await other.syncAll()).not.toContain(pageDocName(id));
  });
});
