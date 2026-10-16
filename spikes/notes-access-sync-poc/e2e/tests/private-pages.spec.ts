import { expect, test } from "@playwright/test";
import { TestServer } from "@homelab/notes-access-sync-poc-server/testing";
import { createPage, editor, openAs, section, storedDocNames, treeRow, waitForSynced } from "./helpers.ts";

let server: TestServer;

test.beforeEach(async () => {
  server = new TestServer({ echo: true });
  await server.start();
});

test.afterEach(async () => {
  await server.stop();
});

test("a member's Private pages reach their own devices and nobody else's", async ({ browser }) => {
  const owner = await server.addPerson("Alice");
  await server.addPerson("Bob", "member", owner);

  // Bob writes a Private page with a subpage on his laptop.
  const laptop = await openAs(browser, server.url, "Bob");
  const route = await createPage(laptop, "Bob's journal", "Dear diary");
  await treeRow(laptop, "Bob's journal").getByTestId("add-subpage").click();
  await laptop.getByTestId("page-title").fill("Gift ideas");
  await expect(section(laptop, "private").getByTestId("tree-row")).toHaveText([/Bob's journal/, /Gift ideas/]);
  await waitForSynced(laptop);
  const journalId = route.replace("#/page/", "");

  // His phone gets both, in its Private section, from the page documents it received.
  const phone = await openAs(browser, server.url, "Bob");
  await expect(section(phone, "private").getByTestId("tree-row")).toHaveText([/Bob's journal/]);
  await treeRow(phone, "Bob's journal").getByTestId("tree-toggle").click();
  await expect(section(phone, "private").getByTestId("tree-row")).toHaveText([/Bob's journal/, /Gift ideas/]);
  await phone.goto(`${server.url}/${route}`);
  await expect(editor(phone)).toContainText("Dear diary");

  // Alice, the workspace owner, gets neither: not in her sidebar, not in her browser's storage.
  const alice = await openAs(browser, server.url, "Alice");
  await waitForSynced(alice);
  await expect(alice.getByTestId("tree-row")).toHaveCount(0);
  await alice.goto(`${server.url}/${route}`);
  await expect(alice.locator(".empty")).toBeVisible();
  await waitForSynced(alice);
  const stored = await storedDocNames(alice);
  expect(stored.some((name) => name.includes(journalId))).toBe(false);
  expect(stored.filter((name) => name.includes(":page:"))).toEqual([]);
});
