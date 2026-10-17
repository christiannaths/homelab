import { expect, test, type Page } from "@playwright/test";
import { TestServer } from "@homelab/notes-access-sync-poc-server/testing";
import {
  addSubpage,
  createPage,
  editor,
  editorText,
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

/** The page documents this device keeps in IndexedDB. */
async function storedPages(page: Page): Promise<string[]> {
  return (await storedDocNames(page)).filter((n) => n.includes(":page:"));
}

test("an invite removed while the device is online: the page and its subpages leave its storage, and come back when invited again", async ({
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
  await addSubpage(alice, "House manual", "Wifi password");
  await alice.goto(`${server.url}/${manual}`);
  await sharePage(alice, "Bob", "Can edit");
  await waitForSynced(alice);

  const bob = await openAs(browser, server.url, "Bob");
  await treeRow(bob, "House manual").getByTestId("tree-toggle").click();
  await expect(section(bob, "shared").getByTestId("tree-row")).toHaveText([
    /House manual/,
    /Wifi password/,
  ]);
  await bob.goto(`${server.url}/${manual}`);
  await expect(editor(bob)).toContainText("Bins go out on Tuesday");
  await waitForSynced(bob);
  expect(await storedPages(bob)).toHaveLength(2);

  await alice
    .getByTestId("share-entry")
    .filter({ hasText: "Bob" })
    .getByTestId("share-entry-remove")
    .click();
  await expect(bob.getByTestId("tree-row")).toHaveCount(0);
  await expect(bob.getByTestId("page")).toHaveCount(0);
  await expect.poll(() => storedPages(bob)).toEqual([]);
  await expect(bob.locator("body")).not.toContainText("Bins go out");

  // Regaining access: the page comes back at the next sync.
  await sharePage(alice, "Bob", "Can view");
  await expect(section(bob, "shared").getByTestId("tree-row")).toHaveText([
    /House manual/,
    /Wifi password/,
  ]);
  await bob.goto(`${server.url}/${manual}`);
  await expect(editor(bob)).toContainText("Bins go out on Tuesday");
  await expect(bob.getByTestId("page")).toHaveAttribute("data-level", "view");
  await expect.poll(() => storedPages(bob)).toHaveLength(2);
});

test("access removed while the device is offline with unsynced edits: on reconnecting it says so and offers them as a new Private page", async ({
  browser,
}) => {
  const owner = await server.addPerson("Alice");
  await server.addPerson("Bob", "member", owner);

  const alice = await openAs(browser, server.url, "Alice");
  const recipe = await createPage(alice, "Pancakes", "Flour, eggs, milk");
  await sharePage(alice, "Bob", "Can edit");
  await waitForSynced(alice);

  const bob = await openAs(browser, server.url, "Bob");
  await bob.goto(`${server.url}/${recipe}`);
  await expect(editor(bob)).toContainText("Flour, eggs, milk");
  await waitForSynced(bob);

  await bob.context().setOffline(true);
  await expect(bob.getByTestId("sync-badge")).toHaveText(/Offline/);
  await editor(bob).click();
  await bob.keyboard.press("ControlOrMeta+End");
  await bob.keyboard.type(", a pinch of salt");
  await expect(bob.getByTestId("sync-badge")).toHaveText(
    /change\(s\) saved locally/,
  );

  await alice
    .getByTestId("share-entry")
    .filter({ hasText: "Bob" })
    .getByTestId("share-entry-remove")
    .click();
  await waitForSynced(alice);

  await bob.context().setOffline(false);
  const offer = bob.getByTestId("lost-edits");
  await expect(offer).toContainText("Pancakes");
  await expect(bob.getByTestId("tree-row")).toHaveCount(0);
  await expect.poll(() => storedPages(bob)).toEqual([]);

  await offer.getByTestId("lost-edits-keep").click();
  await expect(offer).toHaveCount(0);
  await expect(section(bob, "private").getByTestId("tree-row")).toHaveText([
    /Pancakes/,
  ]);
  await expect(bob.getByTestId("page")).toHaveAttribute("data-level", "full");
  await expect
    .poll(() => editorText(bob))
    .toBe("Flour, eggs, milk, a pinch of salt");
  await waitForSynced(bob);
  const stored = await storedPages(bob);
  expect(stored).toHaveLength(1);
  expect(
    stored.filter((n) => n.endsWith(recipe.replace("#/page/", ""))),
  ).toEqual([]);

  // The edit never reached Alice's page.
  await expect.poll(() => editorText(alice)).toBe("Flour, eggs, milk");
});

test("moving a page to Private asks first, then takes it off everyone else's devices", async ({
  browser,
}) => {
  const owner = await server.addPerson("Alice");
  await server.addPerson("Bob", "member", owner);

  const alice = await openAs(browser, server.url, "Alice");
  const trip = await createPage(alice, "Trip", "Lisbon in May");
  const budget = await addSubpage(alice, "Trip", "Budget");
  await alice.goto(`${server.url}/${trip}`);
  await sharePage(alice, "Bob", "Can edit");
  await waitForSynced(alice);

  const bob = await openAs(browser, server.url, "Bob");
  await treeRow(bob, "Trip").getByTestId("tree-toggle").click();
  await expect(section(bob, "shared").getByTestId("tree-row")).toHaveText([
    /Trip/,
    /Budget/,
  ]);
  await waitForSynced(bob);

  await alice.goto(`${server.url}/${budget}`);
  // Declining the question changes nothing.
  alice.once("dialog", (d) => d.dismiss());
  await alice.getByTestId("move-to-private").click();
  await expect(section(alice, "shared").getByTestId("tree-row")).toHaveText([
    /Trip/,
    /Budget/,
  ]);

  alice.once("dialog", (d) => {
    expect(d.message()).toContain("everyone else");
    void d.accept();
  });
  await alice.getByTestId("move-to-private").click();
  await expect(section(alice, "private").getByTestId("tree-row")).toHaveText([
    /Budget/,
  ]);
  await expect(alice.getByTestId("move-to-private")).toHaveCount(0);

  await expect(section(bob, "shared").getByTestId("tree-row")).toHaveText([
    /Trip/,
  ]);
  await expect.poll(() => storedPages(bob)).toHaveLength(1);
});

test("switching person deletes the previous person's pages from the device", async ({
  browser,
}) => {
  const owner = await server.addPerson("Alice");
  await server.addPerson("Bob", "member", owner);

  const device = await openAs(browser, server.url, "Alice");
  await createPage(device, "Diary", "Dear diary");
  await waitForSynced(device);
  expect(await storedPages(device)).toHaveLength(1);

  await device.getByTestId("switch-person").click();
  await expect(device.getByTestId("person-option")).toHaveCount(2);
  await expect.poll(() => storedDocNames(device)).toEqual([]);

  await device.getByTestId("person-option").filter({ hasText: "Bob" }).click();
  await expect(device.getByTestId("current-person")).toHaveText("Bob");
  await waitForSynced(device);
  await expect(device.getByTestId("tree-row")).toHaveCount(0);
});

test("a removed person's device deletes the workspace's pages at its next sync", async ({
  browser,
}) => {
  const owner = await server.addPerson("Alice");
  await server.addPerson("Bob", "member", owner);

  const alice = await openAs(browser, server.url, "Alice");
  await createPage(alice, "Team rota", "Mondays: Bob");
  await sharePage(alice, "Bob", "Can edit");
  await waitForSynced(alice);

  const bob = await openAs(browser, server.url, "Bob");
  await createPage(bob, "Bob's notes", "Mine");
  await expect(section(bob, "shared").getByTestId("tree-row")).toHaveText([
    /Team rota/,
  ]);
  await waitForSynced(bob);
  expect(await storedPages(bob)).toHaveLength(2);

  await alice.getByTestId("people-link").click();
  await alice
    .getByTestId("person-row")
    .filter({ hasText: "Bob" })
    .getByTestId("person-remove")
    .click();
  await expect(alice.getByTestId("person-row")).toHaveText([/Alice/]);

  await expect(bob.getByTestId("removed-notice")).toBeVisible();
  await expect(bob.getByTestId("person-option")).toHaveText([/Alice/]);
  await expect.poll(() => storedDocNames(bob)).toEqual([]);
});
