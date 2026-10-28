// Trash and restore (issue #135): a page goes to the Trash with its subpages and comes back where
// it was; one whose parent is still trashed comes back at the top of the Private section. Both
// work offline and reach the person's other device.
import type { Locator, Page } from "playwright";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  ADA,
  newDevice,
  OFFLINE_STATUS,
  pageTitle,
  privateSection,
  sidebar,
  signIn,
  startStack,
  waitUntilOfflineReady,
  type Stack,
} from "./stack.ts";

let stack: Stack;

beforeAll(async () => {
  stack = await startStack();
});
afterAll(async () => {
  await stack?.close();
});
// A test that ends offline leaves the front door stopped.
afterEach(async () => {
  await stack?.frontDoor.start();
});

const PAGE_PATH = /\/pages\/[0-9a-f-]+$/;

async function signedIn(): Promise<Page> {
  const page = await newDevice(stack.browser);
  await signIn(page, stack.frontDoor, ADA);
  await page.waitForURL(PAGE_PATH);
  return page;
}

/** Clicks `button`, then titles the page it goes to. */
async function addAndTitle(page: Page, button: string, title: string) {
  const before = page.url();
  await privateSection(page).getByRole("button", { name: button }).click();
  await page.waitForURL(
    (url) => PAGE_PATH.test(url.href) && url.href !== before,
  );
  await expect.poll(() => pageTitle(page).inputValue()).toBe("");
  await pageTitle(page).fill(title);
  await privateSection(page)
    .getByRole("link", { name: title, exact: true })
    .waitFor();
}

const addPage = (page: Page, title: string) =>
  addAndTitle(page, "Add a page", title);

const addSubpage = (page: Page, parent: string, title: string) =>
  addAndTitle(page, `Add a subpage to ${parent}`, title);

const trashSection = (page: Page) =>
  sidebar(page).getByRole("region", { name: "Trash" });

/** The Trash, opened if it was closed. */
async function openTrash(page: Page): Promise<Locator> {
  const toggle = trashSection(page).getByRole("button", { name: "Trash" });
  if ((await toggle.getAttribute("aria-expanded")) === "false")
    await toggle.click();
  return trashSection(page);
}

const trash = (page: Page, title: string) =>
  privateSection(page)
    .getByRole("button", { name: `Move ${title} to Trash`, exact: true })
    .click();

const restore = async (page: Page, title: string) =>
  (await openTrash(page))
    .getByRole("button", { name: `Restore ${title}`, exact: true })
    .click();

const subpagesOf = (scope: Locator, title: string) =>
  scope.getByRole("list", { name: `Subpages of ${title}` });

/** The titles of the Private section's top-level pages, in order. */
const topLevelTitles = (page: Page) =>
  privateSection(page)
    .getByRole("list", { name: "Pages" })
    .locator(":scope > li")
    .evaluateAll((items) =>
      items.map((li) => li.querySelector("a")?.textContent ?? ""),
    );

describe("the Trash", () => {
  it("takes a page with its subpages out of the sidebar and lists them", async () => {
    const page = await signedIn();
    await addPage(page, "Old house");
    await addSubpage(page, "Old house", "Old attic");

    await trash(page, "Old house");
    for (const title of ["Old house", "Old attic"])
      await privateSection(page)
        .getByRole("link", { name: title, exact: true })
        .waitFor({ state: "detached" });

    const opened = await openTrash(page);
    await opened.getByText("Old house", { exact: true }).waitFor();
    await subpagesOf(opened, "Old house")
      .getByText("Old attic", { exact: true })
      .waitFor();
  });

  it("restores a page with its subpages to where it was", async () => {
    const page = await signedIn();
    await addPage(page, "Before Car");
    await addPage(page, "Car");
    await addSubpage(page, "Car", "Tyres");
    await addPage(page, "After Car");

    await trash(page, "Car");
    await privateSection(page)
      .getByRole("link", { name: "Car", exact: true })
      .waitFor({ state: "detached" });
    await restore(page, "Car");

    await subpagesOf(privateSection(page), "Car")
      .getByRole("link", { name: "Tyres" })
      .waitFor();
    await expect
      .poll(async () =>
        (await topLevelTitles(page)).filter((t) => t.includes("Car")),
      )
      .toEqual(["Before Car", "Car", "After Car"]);
    await trashSection(page)
      .getByText("Car", { exact: true })
      .waitFor({ state: "detached" });
  });

  it("restores a subpage whose parent is still trashed to the top of the Private section", async () => {
    const page = await signedIn();
    await addPage(page, "Shed");
    await addSubpage(page, "Shed", "Mower");

    await trash(page, "Shed");
    await restore(page, "Mower");

    await expect.poll(() => topLevelTitles(page)).toContain("Mower");
    const opened = await openTrash(page);
    await opened.getByText("Shed", { exact: true }).waitFor();
    await opened
      .getByText("Mower", { exact: true })
      .waitFor({ state: "detached" });
  });

  it("works offline, and the other device sees the result after reconnecting", async () => {
    const phone = await signedIn();
    await addPage(phone, "Boat");
    await addSubpage(phone, "Boat", "Sails");
    await addPage(phone, "Bike");

    const laptop = await signedIn();
    for (const title of ["Boat", "Bike"])
      await privateSection(laptop)
        .getByRole("link", { name: title, exact: true })
        .waitFor();

    await waitUntilOfflineReady(phone);
    await phone.context().setOffline(true);
    await stack.frontDoor.stop();
    await phone.getByText(OFFLINE_STATUS).waitFor();
    await trash(phone, "Boat");
    await trash(phone, "Bike");
    await restore(phone, "Sails");
    await privateSection(phone).getByRole("link", { name: "Sails" }).waitFor();

    await stack.frontDoor.start();
    await phone.context().setOffline(false);
    await expect.poll(() => topLevelTitles(laptop)).toContain("Sails");
    const opened = await openTrash(laptop);
    for (const title of ["Boat", "Bike"]) {
      await opened.getByText(title, { exact: true }).waitFor();
      await privateSection(laptop)
        .getByRole("link", { name: title, exact: true })
        .waitFor({ state: "detached" });
    }
  });

  it("offers no way to delete forever or empty it", async () => {
    const page = await signedIn();
    await addPage(page, "Kept");
    await trash(page, "Kept");
    const opened = await openTrash(page);
    await opened.getByText("Kept", { exact: true }).waitFor();
    expect(
      await sidebar(page)
        .getByRole("button", { name: /delete|empty/i })
        .count(),
    ).toBe(0);
  });
});
