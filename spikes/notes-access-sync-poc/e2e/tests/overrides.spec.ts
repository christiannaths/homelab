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

test("restricting someone to No access on a subpage hides it from them, and Restore inherited access brings it back", async ({
  browser,
}) => {
  const owner = await server.addPerson("Alice");
  await server.addPerson("Bob", "member", owner);

  const alice = await openAs(browser, server.url, "Alice");
  const manual = await createPage(
    alice,
    "House manual",
    "Bins go out on Tuesday",
  );
  const wifi = await addSubpage(alice, "House manual", "Wifi password");
  await alice.goto(`${server.url}/${manual}`);
  await sharePage(alice, "Bob", "Can edit");

  // On the subpage, Bob's entry is inherited from the parent; changing it overrides it there.
  await alice.goto(`${server.url}/${wifi}`);
  const panel = alice.getByTestId("share-panel");
  const bobsEntry = panel.getByTestId("share-entry").filter({ hasText: "Bob" });
  await expect(bobsEntry).toHaveAttribute("data-source", "inherited");
  await expect(bobsEntry.getByTestId("share-entry-from")).toHaveText(
    "from House manual",
  );
  await bobsEntry
    .getByTestId("share-entry-level")
    .selectOption({ label: "No access" });
  await expect(bobsEntry).toHaveAttribute("data-source", "override");
  await expect(bobsEntry.getByTestId("share-entry-remove")).toHaveText(
    "Restore inherited access",
  );
  await waitForSynced(alice);

  // Bob gets the parent, and no trace of the subpage.
  const bob = await openAs(browser, server.url, "Bob");
  await expect(section(bob, "shared").getByTestId("tree-row")).toHaveText([
    /House manual/,
  ]);
  await expect(
    treeRow(bob, "House manual").getByTestId("tree-toggle"),
  ).toBeHidden();
  await waitForSynced(bob);
  expect(
    (await storedDocNames(bob)).filter((n) => n.includes(":page:")),
  ).toHaveLength(1);

  // Restore inherited access: the subpage reaches Bob's open app, at the inherited level.
  await bobsEntry.getByTestId("share-entry-remove").click();
  await expect(bobsEntry).toHaveAttribute("data-source", "inherited");
  await treeRow(bob, "House manual").getByTestId("tree-toggle").click();
  await expect(section(bob, "shared").getByTestId("tree-row")).toHaveText([
    /House manual/,
    /Wifi password/,
  ]);
  await bob.goto(`${server.url}/${wifi}`);
  await expect(bob.getByTestId("page")).toHaveAttribute("data-level", "edit");
  await expect(bob.getByTestId("breadcrumb-item")).toHaveText(["House manual"]);
});

test("a page shared without its parent is at the top of Shared, with a breadcrumb that skips the parent", async ({
  browser,
}) => {
  const owner = await server.addPerson("Alice");
  await server.addPerson("Bob", "member", owner);

  const alice = await openAs(browser, server.url, "Alice");
  await createPage(alice, "Secret garden", "Behind the shed");
  const tomatoes = await addSubpage(alice, "Secret garden", "Tomatoes");
  await alice.goto(`${server.url}/${tomatoes}`);
  await expect(alice.getByTestId("breadcrumb-item")).toHaveText([
    "Secret garden",
  ]);
  await sharePage(alice, "Bob", "Can view");
  await waitForSynced(alice);

  const bob = await openAs(browser, server.url, "Bob");
  await expect(section(bob, "shared").getByTestId("tree-row")).toHaveText([
    /Tomatoes/,
  ]);
  await bob.goto(`${server.url}/${tomatoes}`);
  await expect(bob.getByTestId("page")).toHaveAttribute("data-level", "view");
  await expect(editor(bob)).toBeVisible();
  await expect(bob.getByTestId("breadcrumb-item")).toHaveCount(0);
  await expect(bob.locator("body")).not.toContainText("Secret garden");
  await waitForSynced(bob);
  expect(
    (await storedDocNames(bob)).filter((n) => n.includes(":page:")),
  ).toHaveLength(1);
});
