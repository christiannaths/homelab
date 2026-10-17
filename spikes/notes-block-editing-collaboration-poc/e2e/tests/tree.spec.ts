import { expect, test } from "@playwright/test";
import {
  createTitledPage,
  dragTreeItem,
  openApp,
  treeRow,
  treeShape,
  waitForServiceWorker,
  waitForSynced,
} from "./helpers";
import { TestServer } from "./server";

let server: TestServer;
test.beforeEach(async () => {
  server = new TestServer();
  await server.start();
});
test.afterEach(async () => {
  await server.stop();
});

test("subpages nest, collapse, and stay nested after a reload", async ({
  page,
}) => {
  await openApp(page, server.url);
  await createTitledPage(page, "Projects");
  await treeRow(page, "Projects").hover();
  await treeRow(page, "Projects").getByTestId("add-subpage").click();
  await page.getByTestId("page-title").fill("Garden");
  await expect.poll(() => treeShape(page)).toEqual(["0:Projects", "1:Garden"]);

  await treeRow(page, "Projects").getByTestId("tree-toggle").click();
  await expect.poll(() => treeShape(page)).toEqual(["0:Projects"]);
  await treeRow(page, "Projects").getByTestId("tree-toggle").click();

  await page.reload();
  await expect.poll(() => treeShape(page)).toEqual(["0:Projects", "1:Garden"]);
});

test("drag and drop reorders and re-parents pages, live for other users", async ({
  browser,
}) => {
  const alice = await (await browser.newContext()).newPage();
  const bob = await (await browser.newContext()).newPage();
  await openApp(alice, server.url);
  await openApp(bob, server.url);
  for (const t of ["Alpha", "Bravo", "Charlie"])
    await createTitledPage(alice, t);
  await expect
    .poll(() => treeShape(bob))
    .toEqual(["0:Alpha", "0:Bravo", "0:Charlie"]);

  await dragTreeItem(alice, "Charlie", "Alpha", "inside");
  await expect
    .poll(() => treeShape(alice))
    .toEqual(["0:Alpha", "1:Charlie", "0:Bravo"]);

  await dragTreeItem(alice, "Bravo", "Alpha", "before");
  await expect
    .poll(() => treeShape(alice))
    .toEqual(["0:Bravo", "0:Alpha", "1:Charlie"]);

  // Bob sees the same structure (after expanding Alpha, since expansion is per device).
  await expect.poll(() => treeShape(bob)).toEqual(["0:Bravo", "0:Alpha"]);
  await treeRow(bob, "Alpha").getByTestId("tree-toggle").click();
  await expect
    .poll(() => treeShape(bob))
    .toEqual(["0:Bravo", "0:Alpha", "1:Charlie"]);

  // A page can't be dropped into its own subtree.
  await dragTreeItem(alice, "Alpha", "Charlie", "inside");
  await expect
    .poll(() => treeShape(alice))
    .toEqual(["0:Bravo", "0:Alpha", "1:Charlie"]);
});

test("trashing a page hides its subtree, and restoring brings it back", async ({
  page,
}) => {
  await openApp(page, server.url);
  await createTitledPage(page, "Recipes");
  await treeRow(page, "Recipes").getByTestId("add-subpage").click();
  await page.getByTestId("page-title").fill("Soup");
  await treeRow(page, "Recipes").locator(".tree-link").click();
  await page.getByTestId("trash-page").click();
  await expect.poll(() => treeShape(page)).toEqual([]);
  await expect(page.getByTestId("trash-link")).toHaveText("Trash (1)");

  await page.getByTestId("trash-link").click();
  await page.getByTestId("restore").click();
  await expect.poll(() => treeShape(page)).toEqual(["0:Recipes", "1:Soup"]);
});

test("conflicting offline moves (A into B, B into A) converge without a cycle", async ({
  browser,
}) => {
  const aliceCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await (await browser.newContext()).newPage();
  await openApp(alice, server.url);
  await waitForServiceWorker(alice);
  await createTitledPage(alice, "Alpha");
  await createTitledPage(alice, "Bravo");
  await waitForSynced(alice);
  await openApp(bob, server.url);
  await expect.poll(() => treeShape(bob)).toEqual(["0:Alpha", "0:Bravo"]);

  await aliceCtx.setOffline(true);
  await expect(alice.getByTestId("sync-badge")).toHaveText(/Offline/);
  await dragTreeItem(alice, "Alpha", "Bravo", "inside");
  await expect.poll(() => treeShape(alice)).toEqual(["0:Bravo", "1:Alpha"]);
  await dragTreeItem(bob, "Bravo", "Alpha", "inside");
  await expect.poll(() => treeShape(bob)).toEqual(["0:Alpha", "1:Bravo"]);

  await aliceCtx.setOffline(false);
  await waitForSynced(alice);
  // Expand everything on both sides, then compare.
  for (const p of [alice, bob]) {
    for (const t of ["Alpha", "Bravo"]) {
      const toggle = treeRow(p, t).getByTestId("tree-toggle");
      if (
        (await toggle.isVisible()) &&
        (await toggle.getAttribute("aria-label")) === "Expand"
      )
        await toggle.click();
    }
  }
  await expect
    .poll(async () => (await treeShape(alice)).join())
    .toBe((await treeShape(bob)).join());
  const shape = await treeShape(alice);
  expect(shape).toHaveLength(2);
  expect(shape.map((s) => s[0])).toEqual(["0", "1"]); // one is now inside the other, no cycle, nothing lost
});
