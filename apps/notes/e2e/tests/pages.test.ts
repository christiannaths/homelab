// Writing pages in the Private section (issue #133): adding and titling a page, writing in it,
// each page's address, a person's devices syncing live and merging offline edits, and nobody
// else ever seeing them.
import type { Page } from "playwright";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  ADA,
  DANA,
  newDevice,
  OFFLINE_STATUS,
  pageBody,
  pageTitle,
  privateSection,
  signIn,
  startStack,
  waitUntilOfflineReady,
  type Person,
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

/** A new device signed in as `person`, on the page Notes lands on. */
async function signedIn(person: Person): Promise<Page> {
  const page = await newDevice(stack.browser);
  await signIn(page, stack.frontDoor, person);
  await page.waitForURL(PAGE_PATH);
  return page;
}

/** Adds a page at the end of the Private section and gives it `title`; resolves on its address. */
async function addPage(page: Page, title: string): Promise<string> {
  const before = page.url();
  await privateSection(page)
    .getByRole("button", { name: "Add a page" })
    .click();
  await page.waitForURL(
    (url) => PAGE_PATH.test(url.href) && url.href !== before,
  );
  await expect.poll(() => pageTitle(page).inputValue()).toBe("");
  await pageTitle(page).fill(title);
  await privateSection(page).getByRole("link", { name: title }).waitFor();
  return page.url();
}

/** Types `text` at the end of the page's body. */
async function write(page: Page, text: string): Promise<void> {
  await pageBody(page).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(text);
}

const bodyShows = (page: Page, text: string) =>
  pageBody(page).getByText(text).waitFor();

describe("a page in the Private section", () => {
  it("is where Notes lands the first time: an empty, untitled page", async () => {
    const page = await signedIn(ADA);
    expect(await pageTitle(page).inputValue()).toBe("");
    expect(await pageTitle(page).getAttribute("placeholder")).toBe("Untitled");
    await privateSection(page)
      .getByRole("link", { name: "Untitled" })
      .waitFor();
  });

  it("is added, titled and written in, with a checklist ticked, and its address reloads to it", async () => {
    const page = await signedIn(ADA);
    const address = await addPage(page, "Groceries");
    await write(page, "[] Milk");
    const item = pageBody(page).getByRole("checkbox");
    await item.check();

    await page.goto(stack.frontDoor.notesUrl);
    await page.goto(address);
    await expect.poll(() => pageTitle(page).inputValue()).toBe("Groceries");
    await bodyShows(page, "Milk");
    expect(await pageBody(page).getByRole("checkbox").isChecked()).toBe(true);
  });

  it("offers headings, lists, checklists, quotes, code and tables, but no image, file, video or audio", async () => {
    const page = await signedIn(ADA);
    await addPage(page, "Blocks");
    await write(page, "/");
    const menu = page.getByRole("listbox");
    for (const name of [
      "Heading 1",
      "Bullet List",
      "Check List",
      "Quote",
      "Code Block",
      "Table",
    ])
      await menu
        .getByRole("option", { name: new RegExp(name, "i") })
        .first()
        .waitFor();
    for (const name of ["Image", "Video", "Audio", "File"])
      expect(
        await menu
          .getByRole("option", { name: new RegExp(`^${name}`) })
          .count(),
      ).toBe(0);
  });

  it("shows on the person's other device, with edits arriving live", async () => {
    const phone = await signedIn(ADA);
    const address = await addPage(phone, "Shared plan");

    const laptop = await signedIn(ADA);
    await privateSection(laptop)
      .getByRole("link", { name: "Shared plan" })
      .click();
    await laptop.waitForURL(address);

    await write(phone, "Written on the phone");
    await bodyShows(laptop, "Written on the phone");
    await pageTitle(laptop).fill("Shared plan, renamed");
    await privateSection(phone)
      .getByRole("link", { name: "Shared plan, renamed" })
      .waitFor();
  });

  it("merges edits made offline on two devices once they reconnect, saying it is offline meanwhile", async () => {
    const phone = await signedIn(ADA);
    const address = await addPage(phone, "Trip");
    await write(phone, "Packing list");
    const laptop = await signedIn(ADA);
    await laptop.goto(address);
    await bodyShows(laptop, "Packing list");
    await waitUntilOfflineReady(phone);
    await waitUntilOfflineReady(laptop);

    await laptop.context().setOffline(true);
    await phone.context().setOffline(true);
    await stack.frontDoor.stop();
    for (const device of [phone, laptop])
      await device.getByText(OFFLINE_STATUS).waitFor();
    await write(phone, " passport");
    await write(laptop, " charger");

    await stack.frontDoor.start();
    await phone.context().setOffline(false);
    await laptop.context().setOffline(false);
    for (const device of [phone, laptop]) {
      await device.getByText(OFFLINE_STATUS).waitFor({ state: "detached" });
      await bodyShows(device, "passport");
      await bodyShows(device, "charger");
    }
  });

  it("added offline is still there after reloading offline, and reaches the other device on reconnecting", async () => {
    const phone = await signedIn(ADA);
    const laptop = await signedIn(ADA);
    await waitUntilOfflineReady(phone);

    await phone.context().setOffline(true);
    await stack.frontDoor.stop();
    const address = await addPage(phone, "Made offline");
    await write(phone, "Before the reload");
    // The last keystrokes' IndexedDB writes have no event to wait for, and a reload in the same
    // instant drops them, as closing the tab would.
    await phone.waitForTimeout(1000);
    await phone.reload();
    await phone.getByText(OFFLINE_STATUS).waitFor();
    await privateSection(phone)
      .getByRole("link", { name: "Made offline" })
      .waitFor();
    await phone.goto(address);
    await bodyShows(phone, "Before the reload");

    await stack.frontDoor.start();
    await phone.context().setOffline(false);
    await privateSection(laptop)
      .getByRole("link", { name: "Made offline" })
      .click();
    await bodyShows(laptop, "Before the reload");
  });

  it("is never seen by anyone else, not even at its address", async () => {
    const ada = await signedIn(ADA);
    const address = await addPage(ada, "Ada's secret");
    await write(ada, "Only for Ada");

    const dana = await signedIn(DANA);
    await privateSection(dana)
      .getByRole("link", { name: "Untitled" })
      .waitFor();
    expect(await dana.getByText("Ada's secret").count()).toBe(0);
    await dana.goto(address);
    await dana.getByText("This page isn't available").waitFor();
    expect(await dana.getByText("Only for Ada").count()).toBe(0);
    expect(await dana.getByText("Ada's secret").count()).toBe(0);
  });
});
