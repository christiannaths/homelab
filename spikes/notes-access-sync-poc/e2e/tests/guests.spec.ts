import { expect, test } from "@playwright/test";
import {
  connectAs,
  TestServer,
} from "@homelab/notes-access-sync-poc-server/testing";
import {
  addSubpage,
  createPage,
  editor,
  openAs,
  section,
  sharePage,
  storedDocNames,
  treeRow,
  waitForSynced,
} from "./helpers.ts";

let server: TestServer;

test.beforeEach(async () => {
  server = new TestServer({ echo: true });
  await server.start();
});

test.afterEach(async () => {
  await server.stop();
});

test("a guest sees only what was shared with them, teamspace pages included, and adds subpages only there", async ({
  browser,
}) => {
  const owner = await server.addPerson("Alice");
  const bob = await server.addPerson("Bob", "member", owner);
  const gus = await server.addPerson("Gus", "guest", owner);

  // The web app has no teamspace UI yet, so Bob makes his teamspace from a test device.
  const bobDevice = await connectAs(server, bob);
  try {
    const house = await bobDevice.createTeamspace("Secret House", "open", {
      memberLevel: "edit",
      workspaceLevel: "edit",
    });
    const chores = await bobDevice.createTeamspacePage(
      house,
      "Chores",
      "Bins on Tuesday",
    );
    await bobDevice.createTeamspacePage(house, "Garden", "Plant tulips");
    await bobDevice.share(chores, gus.id, "view");
    await bobDevice.settled();
  } finally {
    await bobDevice.close();
  }

  // Alice shares Trip with Gus at Can edit, and Notice with everyone in the workspace.
  const alice = await openAs(browser, server.url, "Alice");
  const trip = await createPage(alice, "Trip", "Lisbon in May");
  await sharePage(alice, "Gus", "Can edit");
  await createPage(alice, "Notice", "Office closed Friday");
  await alice.getByTestId("share-general").selectOption("view");
  await waitForSynced(alice);

  // Gus gets Trip and the teamspace page, both in Shared, and nothing else: no Private section.
  const guest = await openAs(browser, server.url, "Gus");
  const sharedRows = section(guest, "shared").getByTestId("tree-row");
  await expect
    .poll(async () =>
      (await sharedRows.allTextContents())
        .map((t) => t.replace(/[^\w ]/g, "").trim())
        .toSorted(),
    )
    .toEqual(["Chores", "Trip"]);
  await expect(section(guest, "private")).toHaveCount(0);
  await expect(guest.getByTestId("new-page")).toHaveCount(0);
  await waitForSynced(guest);
  const stored = (await storedDocNames(guest)).filter(
    (n) => n.includes(":page:") || n.includes(":teamspace:"),
  );
  expect(stored).toHaveLength(2);

  // With Can edit, Gus adds a subpage inside Trip, and it reaches Alice.
  await guest.goto(`${server.url}/${trip}`);
  await addSubpage(guest, "Trip", "Snacks");
  await waitForSynced(guest);
  await treeRow(alice, "Trip").getByTestId("tree-toggle").click();
  await expect(section(alice, "shared").getByTestId("tree-row")).toHaveText([
    /Trip/,
    /Snacks/,
    /Notice/,
  ]);
  await expect(treeRow(alice, "Snacks")).toBeVisible();
  await alice.goto(`${server.url}/${trip}`);
  await expect(editor(alice)).toContainText("Lisbon in May");
});
