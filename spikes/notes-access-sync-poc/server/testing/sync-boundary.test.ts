import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Person } from "@homelab/notes-access-sync-poc-model";
import { connectAs, TestServer, WORKSPACE_DOC, type TestClient } from "./index.ts";

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
  beforeAll(async () => {
    await server.start();
    olive = await server.addPerson("Olive");
    max = await server.addPerson("Max", "member", olive);
  });
  afterAll(async () => {
    await Promise.all(clients.map((c) => c.close()));
    await server.stop();
  });

  it("sends a page one person created to another person", async () => {
    const oliveClient = await connect(server, olive);
    const pageId = await oliveClient.createPage("Shopping list", "Milk");
    await oliveClient.settled();

    const maxClient = await connect(server, max);
    const received = await maxClient.syncAll();
    expect(new Set(received)).toEqual(new Set([WORKSPACE_DOC, `page:${pageId}`]));
    expect(maxClient.pageTitles()).toEqual(["Shopping list"]);
    expect(maxClient.pageText(pageId)).toBe("Milk");
    expect(await maxClient.open(`page:${pageId}`)).toMatchObject({ status: "synced", scope: "read-write" });
    expect(await oliveClient.syncAll()).toEqual(received);
  });

  it("knows which person each connection belongs to", async () => {
    const gus = await server.addPerson("Gus", "guest", olive);
    const gusClient = await connect(server, gus);
    await gusClient.open(WORKSPACE_DOC);
    expect(await server.connections()).toContainEqual({ personId: gus.id, documentName: WORKSPACE_DOC });
  });

  it("refuses a connection from someone who is not in the workspace", async () => {
    const stranger = await connect(server, { id: "stranger", name: "Stranger", role: "member" });
    const result = await stranger.open(WORKSPACE_DOC);
    expect(result).toEqual({ status: "denied", reason: "no-access" });
    expect(stranger.received()).toEqual([]);
  });
});
