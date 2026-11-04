// More workspaces (issue #136): creating one, which needs a connection, renaming one offline,
// switching between them with each showing only its own pages, a new one reaching the person's
// other device, and Notes reopening the workspace and page last used.
import type { Page } from "playwright";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  ADA,
  defaultWorkspaceOf,
  goOffline,
  goOnline,
  newDevice,
  OFFLINE_STATUS,
  pageTitle,
  privateSection,
  sidebar,
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
const DEFAULT = defaultWorkspaceOf(ADA);

async function signedIn(person: Person): Promise<Page> {
  const page = await newDevice(stack.browser);
  await signIn(page, stack.frontDoor, person);
  await page.waitForURL(PAGE_PATH);
  return page;
}

/** The sidebar's workspace switcher, which shows the workspace open now. */
const switcher = (page: Page) =>
  sidebar(page).getByRole("region", { name: "Workspace" }).getByRole("button");

const shows = (page: Page, workspace: string) =>
  expect.poll(() => switcher(page).textContent()).toBe(workspace);

const menuItem = (page: Page, name: string | RegExp) =>
  page.getByRole("menuitem", { name });

async function switchTo(page: Page, workspace: string): Promise<void> {
  await switcher(page).click();
  await menuItem(page, workspace).click();
  await shows(page, workspace);
}

/** Makes a workspace from the switcher; resolves once Notes has opened its first page. */
async function createWorkspace(page: Page, name: string): Promise<void> {
  const before = page.url();
  await switcher(page).click();
  await menuItem(page, /New workspace/).click();
  const dialog = page.getByRole("dialog", { name: "New workspace" });
  await dialog.getByRole("textbox", { name: "Name" }).fill(name);
  await dialog.getByRole("button", { name: "Create" }).click();
  await shows(page, name);
  await page.waitForURL(
    (url) => PAGE_PATH.test(url.href) && url.href !== before,
  );
}

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

const pageLinks = (page: Page) =>
  privateSection(page).getByRole("link").allTextContents();

describe("another workspace", () => {
  it("is created with an empty page, and each workspace shows only its own pages", async () => {
    const page = await signedIn(ADA);
    await shows(page, DEFAULT);
    await addPage(page, "Household budget");

    await createWorkspace(page, "Side projects");
    expect(await pageTitle(page).inputValue()).toBe("");
    await expect.poll(() => pageLinks(page)).toEqual(["Untitled"]);
    await addPage(page, "Robot arm");

    await switchTo(page, DEFAULT);
    await privateSection(page)
      .getByRole("link", { name: "Household budget" })
      .waitFor();
    expect(await pageLinks(page)).not.toContain("Robot arm");

    await switchTo(page, "Side projects");
    await expect.poll(() => pageLinks(page)).toEqual(["Untitled", "Robot arm"]);
  });

  it("can't be created offline, and says it needs a connection", async () => {
    const page = await signedIn(ADA);
    await waitUntilOfflineReady(page);
    await goOffline(page, stack.frontDoor);
    await page.getByText(OFFLINE_STATUS).waitFor();

    await switcher(page).click();
    expect(await menuItem(page, /New workspace/).isDisabled()).toBe(true);
    await page.getByText("Creating a workspace needs a connection").waitFor();
  });

  it("appears live on the person's other device", async () => {
    const phone = await signedIn(ADA);
    const laptop = await signedIn(ADA);
    await switcher(laptop).click();

    await createWorkspace(phone, "Recipes");
    await menuItem(laptop, "Recipes").click();
    await shows(laptop, "Recipes");
    await expect.poll(() => pageLinks(laptop)).toEqual(["Untitled"]);
  });

  it("is renamed offline, and the new name reaches the other device on reconnecting", async () => {
    const phone = await signedIn(ADA);
    await createWorkspace(phone, "Garden");
    const laptop = await signedIn(ADA);
    await switchTo(laptop, "Garden");
    await waitUntilOfflineReady(phone);

    await goOffline(phone, stack.frontDoor);
    await phone.getByText(OFFLINE_STATUS).waitFor();
    await switcher(phone).click();
    await menuItem(phone, "Rename workspace").click();
    const dialog = phone.getByRole("dialog", { name: "Rename workspace" });
    await dialog.getByRole("textbox", { name: "Name" }).fill("Garden shed");
    await dialog.getByRole("button", { name: "Save" }).click();
    await shows(phone, "Garden shed");
    expect(await switcher(laptop).textContent()).toBe("Garden");

    await goOnline(phone, stack.frontDoor);
    await shows(laptop, "Garden shed");
  });

  it("and page last used are where Notes reopens", async () => {
    const page = await signedIn(ADA);
    await createWorkspace(page, "Travel");
    await addPage(page, "Lisbon");
    const address = await addPage(page, "Porto");
    await privateSection(page).getByRole("link", { name: "Lisbon" }).click();
    const lisbon = page.url();
    expect(lisbon).not.toBe(address);

    await page.goto(stack.frontDoor.notesUrl);
    await page.waitForURL(lisbon);
    await shows(page, "Travel");
    expect(await pageTitle(page).inputValue()).toBe("Lisbon");
  });
});
