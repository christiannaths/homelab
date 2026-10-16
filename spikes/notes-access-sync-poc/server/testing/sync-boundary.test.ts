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
    expect(after.pageTitles()).toEqual(["Nia's list"]);
    const other = await connect(server, olive);
    expect(await other.syncAll()).toEqual([indexDocName(olive.id)]);
  });
});
