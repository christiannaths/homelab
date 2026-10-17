import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  connectAs,
  seedWorkspace,
  TestServer,
  type SeededWorkspace,
  type TestClient,
} from "./index.ts";

// The scale seed (#22), at a small size: what each person's device receives must follow the
// access the seed sets up, so the timings at full size measure per-person sync, not everything.
describe("scale seed", () => {
  const server = new TestServer();
  const clients: TestClient[] = [];
  let seeded: SeededWorkspace;
  const received = async (person: keyof SeededWorkspace["people"]) => {
    const client = await connectAs(server, seeded.people[person]);
    clients.push(client);
    return { names: await client.syncAll(), client };
  };

  beforeAll(async () => {
    seeded = seedWorkspace(server.dataDir, {
      olivePrivate: 6,
      maxPrivate: 5,
      sharedWithMax: 2,
      tripForGus: 1,
      engineering: 4,
      leadership: 3,
      tasksRows: 4,
      readingRows: 2,
      rowsForGus: 1,
    });
    await server.start();
  });
  afterAll(async () => {
    await Promise.all(clients.map((c) => c.close()));
    await server.stop();
  });

  it("writes every page of the workspace", () => {
    // 6 + 5 + (1 + 2) + (1 + 1) + 4 + 3 + (1 + 4) + (1 + 2)
    expect(seeded.pageCount).toBe(31);
  });

  it("gives Olive (workspace owner, in both teamspaces) everything except Max's Private pages", async () => {
    const { names, client } = await received("olive");
    // 6 + (1 + 2) + (1 + 1) + 4 + 3 + (1 + 4) + (1 + 2)
    expect(names.filter((n) => n.startsWith("page:"))).toHaveLength(26);
    expect(client.receivedContent()).not.toContain("Max private");
    // her index, both teamspaces, and both databases' properties
    expect(names.filter((n) => !n.startsWith("page:"))).toHaveLength(5);
  });

  it("gives Max his Private pages, the page shared with him and Engineering, but not Leadership", async () => {
    const { names, client } = await received("max");
    // 5 + (1 + 2) + 4 + (1 + 4)
    expect(names.filter((n) => n.startsWith("page:"))).toHaveLength(17);
    expect(names.filter((n) => !n.startsWith("page:"))).toHaveLength(3); // index, Engineering, Tasks properties
    expect(client.receivedContent()).not.toContain("Leadership");
    expect(client.receivedContent()).not.toContain("Olive private");
  });

  it("gives Gus (a guest) only the Trip page and the Tasks row shared with him", async () => {
    const { names, client } = await received("gus");
    expect(names.filter((n) => n.startsWith("page:"))).toHaveLength(3);
    expect(client.receivedContent()).not.toContain("Engineering");
  });

  it("names an Engineering page that both Olive and Max can edit", async () => {
    const olive = await connectAs(server, seeded.people.olive);
    const max = await connectAs(server, seeded.people.max);
    clients.push(olive, max);
    await Promise.all([olive.syncAll(), max.syncAll()]);
    expect(olive.level(seeded.engineeringPageId)).toBe("full");
    expect(max.level(seeded.engineeringPageId)).toBe("full");
    expect(
      max.pages().find((p) => p.id === seeded.engineeringPageId)?.title,
    ).toBe("Engineering 1");
  });

  it("drops no connection and refuses nothing while the devices sync", async () => {
    expect(await server.refusals()).toEqual([]);
    expect(server.logs.filter((l) => /closing connection/i.test(l))).toEqual(
      [],
    );
  });
});
