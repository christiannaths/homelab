import { afterAll, beforeAll, expect, it } from "vitest";
import { TestServer } from "./index.ts";

const server = new TestServer();
beforeAll(() => server.start());
afterAll(() => server.stop());

it("makes the first person the owner, who can then add members and guests", async () => {
  expect(await server.people()).toEqual([]);
  const olive = await server.addPerson("Olive", "member");
  expect(olive.role).toBe("owner");

  const max = await server.addPerson("Max", "member", olive);
  const gus = await server.addPerson("Gus", "guest", olive);
  expect(await server.people()).toEqual([olive, max, gus]);
  expect([max.role, gus.role]).toEqual(["member", "guest"]);

  await expect(server.addPerson("Mia", "member", max)).rejects.toThrow(/403/);
  await expect(server.addPerson("Mia", "member")).rejects.toThrow(/401/);
  expect((await server.people()).map((p) => p.name)).toEqual([
    "Olive",
    "Max",
    "Gus",
  ]);
});
