import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Person } from "@homelab/notes-access-sync-poc-model";
import {
  connectAs,
  indexDocName,
  pageDocName,
  schemaDocName,
  TestServer,
  waitFor,
  type TestClient,
} from "./index.ts";

// Databases with rows as pages (#20): a database's rows inherit its access, a single row can be
// shared on its own, and Can edit content adds rows and edits values but not the structure.
describe("databases", () => {
  const server = new TestServer();
  const clients: TestClient[] = [];
  const connect = async (person: Person) => {
    const client = await connectAs(server, person);
    clients.push(client);
    return client;
  };

  let max: Person;
  let nia: Person;
  let pia: Person;
  let owner: TestClient;
  let chores: string;
  let points: string;
  let done: string;
  let rows: { dishes: string; bins: string; laundry: string };
  beforeAll(async () => {
    await server.start();
    const olive = await server.addPerson("Olive");
    max = await server.addPerson("Max", "member", olive);
    nia = await server.addPerson("Nia", "member", olive);
    pia = await server.addPerson("Pia", "member", olive);
    // Max's Chores database: shared with Nia at Can edit content, and its Bins row alone with Pia.
    owner = await connect(max);
    const db = await owner.createDatabase("Chores", {
      Points: "number",
      Done: "checkbox",
    });
    chores = db.id;
    ({ Points: points, Done: done } = db.properties);
    await owner.setView(chores, {
      filter: "secret filter",
      sort: { propertyId: points, direction: "desc" },
    });
    rows = {
      dishes: await owner.addRow(
        chores,
        "Dishes",
        { [points]: 3 },
        "Rinse first",
      ),
      bins: await owner.addRow(
        chores,
        "Bins",
        { [points]: 1, [done]: true },
        "Tuesday night",
      ),
      laundry: await owner.addRow(
        chores,
        "Laundry",
        { [points]: 5 },
        "Cold wash",
      ),
    };
    await owner.share(chores, nia.id, "edit-content");
    await owner.share(rows.bins, pia.id, "view");
    await owner.settled();
    await owner.setView(chores, { filter: "" });
    await owner.settled();
  });
  afterAll(async () => {
    await Promise.all(clients.map((c) => c.close()));
    await server.stop();
  });

  it("someone with access to the database receives its rows and row pages", async () => {
    const device = await connect(nia);
    await expect
      .poll(() => device.syncAll())
      .toEqual(
        [
          indexDocName(nia.id),
          ...[chores, rows.dishes, rows.bins, rows.laundry].map(pageDocName),
          schemaDocName(chores),
        ].sort(),
      );
    expect(device.table(chores)).toEqual([
      { title: "Laundry", Points: 5, Done: undefined },
      { title: "Dishes", Points: 3, Done: undefined },
      { title: "Bins", Points: 1, Done: true },
    ]);
    expect(device.pageText(rows.dishes)).toBe("Rinse first");
    expect(device.level(rows.laundry)).toBe("edit-content");
    // Rows are shown in the database, not in the sidebar.
    expect(device.sidebar()).toEqual({ shared: ["Chores"], private: [] });
  });

  it("someone given only one row receives that row and its values, and nothing else of the database", async () => {
    const device = await connect(pia);
    await expect
      .poll(() => device.syncAll())
      .toEqual(
        [
          indexDocName(pia.id),
          pageDocName(rows.bins),
          schemaDocName(chores),
        ].sort(),
      );
    expect(device.row(rows.bins)).toEqual({
      title: "Bins",
      Points: 1,
      Done: true,
    });
    expect(device.pageText(rows.bins)).toBe("Tuesday night");
    expect(device.sidebar()).toEqual({ shared: ["Bins"], private: [] });
    expect(device.denied()).toEqual([]);
    const content = device.receivedContent();
    for (const trace of [
      "Chores",
      "Dishes",
      "Laundry",
      "Rinse first",
      "Cold wash",
      "secret filter",
      "desc",
    ]) {
      expect(content).not.toContain(trace);
    }
    // Asking for the database itself, or another row, is refused.
    expect((await device.open(pageDocName(chores))).status).toBe("denied");
    expect((await device.open(pageDocName(rows.dishes))).status).toBe("denied");
  });

  describe("with Can edit content", () => {
    let device: TestClient;
    beforeAll(async () => {
      device = await connect(nia);
      await waitFor(async () =>
        (await device.syncAll()).includes(schemaDocName(chores)),
      );
    });

    it("adding a row and editing a value are accepted", async () => {
      const ironing = await device.addRow(chores, "Ironing", { [points]: 2 });
      await device.setCell(rows.dishes, done, true);
      await device.settled();
      await waitFor(async () =>
        (await owner.syncAll()).includes(pageDocName(ironing)),
      );
      await expect
        .poll(() => owner.table(chores))
        .toEqual([
          { title: "Laundry", Points: 5, Done: undefined },
          { title: "Dishes", Points: 3, Done: true },
          { title: "Ironing", Points: 2, Done: undefined },
          { title: "Bins", Points: 1, Done: true },
        ]);
      expect(
        (await server.refusals()).filter((r) => r.personId === nia.id),
      ).toEqual([]);
    });

    it("changing a view is refused, and the device gets back in step", async () => {
      await device.setView(chores, { sort: null, filter: "Dishes" });
      await expect
        .poll(() => device.refusals(pageDocName(chores)))
        .toEqual(["structure-refused"]);
      await expect.poll(() => device.view(chores)).toEqual(owner.view(chores));
      expect(owner.view(chores)).toEqual({
        sort: { propertyId: points, direction: "desc" },
        filter: "",
      });
      await device.settled();
    });

    it("changing a property is refused, and the device gets back in step", async () => {
      await device.renameProperty(chores, points, "Effort");
      await device.addProperty(chores, "Due", "text");
      await expect
        .poll(() => device.refusals(schemaDocName(chores)))
        .toEqual(["structure-refused"]);
      await expect
        .poll(() => device.properties(chores))
        .toEqual(["Points", "Done"]);
      await device.settled();
      // Still in step: a value edited after the refusal is accepted.
      await device.setCell(rows.laundry, done, true);
      await device.settled();
      await expect
        .poll(() => owner.table(chores)[0])
        .toEqual({ title: "Laundry", Points: 5, Done: true });
      expect(owner.properties(chores)).toEqual(["Points", "Done"]);
    });
  });

  it("a row shared at Can view can't be edited, and nor can the database's properties", async () => {
    const device = await connect(pia);
    await waitFor(async () =>
      (await device.syncAll()).includes(schemaDocName(chores)),
    );
    await device.setCell(rows.bins, points, 100);
    await device.renameProperty(chores, points, "Score");
    await expect
      .poll(() => device.refusals(pageDocName(rows.bins)))
      .toEqual(["read-only"]);
    await expect
      .poll(() => device.refusals(schemaDocName(chores)))
      .toEqual(["read-only"]);
    await expect
      .poll(() => device.row(rows.bins))
      .toEqual({ title: "Bins", Points: 1, Done: true });
  });

  it("a row raised from Can view to Can edit content takes value edits on the connection opened read-only", async () => {
    const device = await connect(pia);
    await waitFor(async () =>
      (await device.syncAll()).includes(pageDocName(rows.bins)),
    );
    expect(device.level(rows.bins)).toBe("view");
    await owner.share(rows.bins, pia.id, "edit-content");
    await owner.settled();
    await expect
      .poll(() => device.syncAll().then(() => device.level(rows.bins)))
      .toBe("edit-content");
    await device.setCell(rows.bins, points, 2);
    await device.settled();
    await expect
      .poll(() => owner.table(chores).find((r) => r.title === "Bins")?.Points)
      .toBe(2);
  });

  it("unsharing the only row someone has also closes the database's properties on their device", async () => {
    const device = await connect(pia);
    await waitFor(async () =>
      (await device.syncAll()).includes(schemaDocName(chores)),
    );
    await owner.share(rows.bins, pia.id, null);
    await owner.settled();
    await expect
      .poll(() => device.closedReason(pageDocName(rows.bins)))
      .toBe("access-revoked");
    await expect
      .poll(() => device.closedReason(schemaDocName(chores)))
      .toBe("access-revoked");
  });
});
