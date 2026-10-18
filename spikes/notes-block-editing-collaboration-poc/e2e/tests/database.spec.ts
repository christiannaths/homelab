import { expect, test, type Page } from "@playwright/test";
import {
  editor,
  openApp,
  treeRow,
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

const rows = (page: Page) => page.getByTestId("db-row");
const cell = (page: Page, row: number, prop: string) =>
  rows(page).nth(row).getByTestId(`cell-${prop}`);
const titles = (page: Page) =>
  rows(page).evaluateAll((els) =>
    els
      .toSorted(
        (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top,
      )
      .map((el) => {
        const name = el.querySelector('[data-testid="cell-Name"]');
        if (!(name instanceof HTMLInputElement)) {
          throw new Error("row has no Name input");
        }
        return name.value;
      }),
  );

async function addProperty(page: Page, name: string, type: string) {
  await page.getByTestId("add-property").click();
  await page.getByTestId("property-name").fill(name);
  await page.getByTestId("property-type").selectOption(type);
  await page.getByTestId("property-submit").click();
}

async function addRowWithTitle(page: Page, title: string) {
  const before = await rows(page).count();
  await page.getByTestId("new-row").click();
  await expect(rows(page)).toHaveCount(before + 1);
  const input = cell(page, before, "Name");
  await input.fill(title);
  await input.press("Enter");
}

test("a database syncs schema, rows and cells live, and sorts and filters", async ({
  browser,
}) => {
  const alice = await (await browser.newContext()).newPage();
  const bob = await (await browser.newContext()).newPage();
  await openApp(alice, server.url);
  await openApp(bob, server.url);

  await alice.getByTestId("new-database").click();
  await alice.getByTestId("page-title").fill("Chores");
  await addProperty(alice, "Points", "number");
  await addProperty(alice, "Status", "select");
  for (const t of ["Dishes", "Laundry", "Vacuum"])
    await addRowWithTitle(alice, t);
  for (const [i, pts] of [
    [0, "3"],
    [1, "5"],
    [2, "1"],
  ] as const) {
    await cell(alice, i, "Points").fill(pts);
    await cell(alice, i, "Points").press("Enter");
  }
  alice.once("dialog", (d) => d.accept("Done"));
  await cell(alice, 1, "Status").selectOption("__new");
  await expect(cell(alice, 1, "Status").locator("option:checked")).toHaveText(
    "Done",
  );

  // Bob opens the same database and sees everything.
  await treeRow(bob, "Chores").locator(".tree-link").click();
  await expect(rows(bob)).toHaveCount(3);
  await expect.poll(() => titles(bob)).toEqual(["Dishes", "Laundry", "Vacuum"]);
  await expect(cell(bob, 1, "Status").locator("option:checked")).toHaveText(
    "Done",
  );

  // Bob edits a cell; Alice sees it.
  await cell(bob, 2, "Points").fill("8");
  await cell(bob, 2, "Points").press("Enter");
  await expect(cell(alice, 2, "Points")).toHaveValue("8");

  // Sorting is part of the shared view.
  await alice.getByRole("button", { name: "Points" }).click();
  await expect
    .poll(() => titles(alice))
    .toEqual(["Dishes", "Laundry", "Vacuum"]); // 3, 5, 8
  await alice.getByRole("button", { name: /Points/ }).click();
  await expect
    .poll(() => titles(alice))
    .toEqual(["Vacuum", "Laundry", "Dishes"]);
  await expect.poll(() => titles(bob)).toEqual(["Vacuum", "Laundry", "Dishes"]);

  // Filtering is local to each viewer.
  await bob.getByTestId("db-filter").fill("done");
  await expect.poll(() => titles(bob)).toEqual(["Laundry"]);
  await expect.poll(() => titles(alice)).toHaveLength(3);
});

test("a row opens as a page, and its body is available offline on other devices", async ({
  browser,
}) => {
  const alice = await (await browser.newContext()).newPage();
  const bobCtx = await browser.newContext();
  const bob = await bobCtx.newPage();
  await openApp(alice, server.url);
  await alice.getByTestId("new-database").click();
  await alice.getByTestId("page-title").fill("Reading list");
  await addRowWithTitle(alice, "Dune");
  await rows(alice).first().hover();
  await alice.getByTestId("open-row").first().click();
  await expect(alice.getByTestId("cell-Name")).toHaveValue("Dune");
  await editor(alice).click();
  await alice.keyboard.type("Great worldbuilding.");
  await waitForSynced(alice);

  // Bob loads the app once online. The body has content, so his device syncs it too.
  await openApp(bob, server.url);
  await waitForServiceWorker(bob);
  await waitForSynced(bob);
  await bobCtx.setOffline(true);
  await bob.reload();
  await treeRow(bob, "Reading list").locator(".tree-link").click();
  await rows(bob).first().hover();
  await bob.getByTestId("open-row").first().click();
  await expect(editor(bob)).toContainText("Great worldbuilding.");
});

test("a 5,000-row database renders, sorts and filters quickly, online and offline", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await openApp(page, server.url);
  await waitForServiceWorker(page);
  await page.goto(`${server.url}/#/diagnostics`);
  const started = Date.now();
  await page.getByTestId("seed-db").click();
  await expect(page.getByTestId("db-stats")).toHaveAttribute(
    "data-rows",
    "5000",
    { timeout: 60_000 },
  );
  const results: Record<string, string> = {
    "create 5,000 rows and render": `${Date.now() - started} ms`,
  };

  // Virtualised: only a screenful of rows is in the DOM.
  expect(await rows(page).count()).toBeLessThan(80);

  const timed = async (label: string, action: () => Promise<void>) => {
    const t = Date.now();
    await action();
    results[label] =
      `${Date.now() - t} ms (${(await page.getByTestId("db-stats").textContent())?.split("· ").slice(1).join("· ")})`;
  };
  await timed("sort by Points", async () => {
    await page.getByRole("button", { name: "Points" }).click();
    await expect(page.getByRole("button", { name: "Points ↑" })).toBeVisible();
  });
  await timed("filter 'note for'", async () => {
    await page.getByTestId("db-filter").fill("note for");
    await expect(page.getByTestId("db-stats")).toHaveAttribute(
      "data-rows",
      "1000",
    );
  });
  await page.getByTestId("db-filter").fill("");

  // Scroll to the bottom: rows render on demand.
  await page
    .getByTestId("db-scroll")
    .evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(rows(page).last()).toBeVisible();

  await waitForSynced(page);
  await ctx.setOffline(true);
  await timed("offline reload until all 5,000 rows are listed", async () => {
    await page.reload();
    await expect(page.getByTestId("db-stats")).toHaveAttribute(
      "data-rows",
      "5000",
    );
  });

  console.log("\nDatabase scale results:");
  for (const [k, v] of Object.entries(results)) console.log(`  ${k}: ${v}`);
});
