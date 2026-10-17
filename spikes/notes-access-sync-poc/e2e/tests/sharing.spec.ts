import { expect, test } from "@playwright/test";
import { TestServer } from "@homelab/notes-access-sync-poc-server/testing";
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

test("a Private page shared at Can view moves to both people's Shared sections and opens read-only", async ({
  browser,
}) => {
  const owner = await server.addPerson("Alice");
  await server.addPerson("Bob", "member", owner);

  const alice = await openAs(browser, server.url, "Alice");
  const route = await createPage(
    alice,
    "House manual",
    "Bins go out on Tuesday",
  );
  await addSubpage(alice, "House manual", "Wifi");
  await createPage(alice, "Alice's journal", "Not for Bob");
  await expect(section(alice, "private").getByTestId("tree-row")).toHaveText([
    /House manual/,
    /Wifi/,
    /Alice's journal/,
  ]);

  await alice.goto(`${server.url}/${route}`);
  await sharePage(alice, "Bob", "Can view");
  // The sharer's shared page moves to her Shared section; the unshared one stays Private.
  await expect(section(alice, "shared").getByTestId("tree-row")).toHaveText([
    /House manual/,
    /Wifi/,
  ]);
  await expect(section(alice, "private").getByTestId("tree-row")).toHaveText([
    /Alice's journal/,
  ]);
  await waitForSynced(alice);

  // Bob gets the page and its subpage in his Shared section, and nothing else of Alice's.
  const bob = await openAs(browser, server.url, "Bob");
  await expect(section(bob, "shared").getByTestId("tree-row")).toHaveText([
    /House manual/,
  ]);
  await treeRow(bob, "House manual").getByTestId("tree-toggle").click();
  await expect(section(bob, "shared").getByTestId("tree-row")).toHaveText([
    /House manual/,
    /Wifi/,
  ]);
  await expect(section(bob, "private").getByTestId("tree-row")).toHaveCount(0);
  await waitForSynced(bob);
  expect(
    (await storedDocNames(bob)).filter((n) => n.includes(":page:")),
  ).toHaveLength(2);

  // Can view: the page opens read-only, with no Share menu.
  await bob.goto(`${server.url}/${route}`);
  await expect(editor(bob)).toContainText("Bins go out on Tuesday");
  await expect(bob.getByTestId("page")).toHaveAttribute("data-level", "view");
  await expect(editor(bob)).toHaveAttribute("contenteditable", "false");
  await expect(bob.getByTestId("page-title")).toHaveAttribute("readonly", "");
  await expect(bob.getByTestId("share-panel")).toHaveCount(0);
});
