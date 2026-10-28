// Subpages (issue #134): nested in the sidebar with expand and collapse, a breadcrumb of the
// page's parents, and both syncing to the person's other device and working offline.
import type { Page } from "playwright";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  ADA,
  newDevice,
  OFFLINE_STATUS,
  pageTitle,
  privateSection,
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

/** Clicks `button`, then titles the page it goes to; resolves on that page's address. */
async function addAndTitle(
  page: Page,
  button: string,
  title: string,
): Promise<string> {
  const before = page.url();
  await privateSection(page).getByRole("button", { name: button }).click();
  await page.waitForURL(
    (url) => PAGE_PATH.test(url.href) && url.href !== before,
  );
  await expect.poll(() => pageTitle(page).inputValue()).toBe("");
  await pageTitle(page).fill(title);
  await privateSection(page).getByRole("link", { name: title }).waitFor();
  return page.url();
}

const addPage = (page: Page, title: string) =>
  addAndTitle(page, "Add a page", title);

const addSubpage = (page: Page, parent: string, title: string) =>
  addAndTitle(page, `Add a subpage to ${parent}`, title);

/** The sidebar's list of `title`'s subpages, with theirs inside. */
const subpagesOf = (page: Page, title: string) =>
  privateSection(page).getByRole("list", { name: `Subpages of ${title}` });

const breadcrumb = (page: Page) =>
  page.getByRole("navigation", { name: "Breadcrumb" });

describe("a subpage", () => {
  it("is added inside a page and inside a subpage, shows nested, and collapsing hides it", async () => {
    const page = await signedIn();
    await addPage(page, "House");
    await addSubpage(page, "House", "Kitchen");
    await addSubpage(page, "Kitchen", "Pantry");

    await subpagesOf(page, "House")
      .getByRole("link", { name: "Kitchen" })
      .waitFor();
    await subpagesOf(page, "Kitchen")
      .getByRole("link", { name: "Pantry" })
      .waitFor();

    await privateSection(page)
      .getByRole("button", { name: "Collapse House" })
      .click();
    for (const title of ["Kitchen", "Pantry"])
      await privateSection(page)
        .getByRole("link", { name: title })
        .waitFor({ state: "detached" });

    await privateSection(page)
      .getByRole("button", { name: "Expand House" })
      .click();
    await subpagesOf(page, "Kitchen")
      .getByRole("link", { name: "Pantry" })
      .waitFor();
  });

  it("shows its parents in a breadcrumb that goes to them", async () => {
    const page = await signedIn();
    const house = await addPage(page, "Garden");
    const shed = await addSubpage(page, "Garden", "Shed");
    await addSubpage(page, "Shed", "Tools");

    const crumbs = breadcrumb(page).getByRole("link");
    await expect
      .poll(() => crumbs.allTextContents())
      .toEqual(["Garden", "Shed"]);

    await crumbs.filter({ hasText: "Shed" }).click();
    await page.waitForURL(shed);
    await expect.poll(() => pageTitle(page).inputValue()).toBe("Shed");
    await breadcrumb(page).getByRole("link", { name: "Garden" }).click();
    await page.waitForURL(house);
    await expect.poll(() => pageTitle(page).inputValue()).toBe("Garden");
  });

  it("reaches the person's other device, and is added offline and kept through a reload", async () => {
    const phone = await signedIn();
    await addPage(phone, "Trips");
    const lisbon = await addSubpage(phone, "Trips", "Lisbon");

    const laptop = await signedIn();
    await laptop.goto(lisbon);
    await expect.poll(() => pageTitle(laptop).inputValue()).toBe("Lisbon");
    await subpagesOf(laptop, "Trips")
      .getByRole("link", { name: "Lisbon" })
      .waitFor();
    await breadcrumb(laptop).getByRole("link", { name: "Trips" }).waitFor();

    await waitUntilOfflineReady(phone);
    await phone.context().setOffline(true);
    await stack.frontDoor.stop();
    await phone.getByText(OFFLINE_STATUS).waitFor();
    await addSubpage(phone, "Lisbon", "Day one");
    // The title's IndexedDB write has no event to wait for, and a reload in the same instant
    // drops it, as closing the tab would.
    await phone.waitForTimeout(1000);
    await phone.reload();
    await phone.getByText(OFFLINE_STATUS).waitFor();
    await subpagesOf(phone, "Lisbon")
      .getByRole("link", { name: "Day one" })
      .waitFor();
    await breadcrumb(phone).getByRole("link", { name: "Lisbon" }).waitFor();

    await stack.frontDoor.start();
    await phone.context().setOffline(false);
    await privateSection(laptop)
      .getByRole("button", { name: "Expand Lisbon" })
      .click();
    await subpagesOf(laptop, "Lisbon")
      .getByRole("link", { name: "Day one" })
      .waitFor();
  });
});
