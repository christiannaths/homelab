import { expect, type Browser, type Locator, type Page } from "@playwright/test";

/** Opens the app in a fresh browser context (a separate device) and picks `person` from the list. */
export async function openAs(browser: Browser, url: string, person: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(url);
  await pickPerson(page, person);
  return page;
}

export async function pickPerson(page: Page, name: string): Promise<void> {
  await page.getByTestId("person-option").filter({ hasText: name }).click();
  await expect(page.getByTestId("current-person")).toHaveText(name);
  await expect(page.getByTestId("sync-badge")).toBeVisible();
}

/** A sidebar section: "private" or "shared". */
export function section(page: Page, key: "private" | "shared") {
  return page.locator(`[data-testid="sidebar-section"][data-section="${key}"]`);
}

/** Names of this person's documents in the browser's IndexedDB (`notes-access:<person>:<doc>`). */
export async function storedDocNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name ?? ""));
}

/** Waits until the service worker controls the page, so later reloads work offline. */
export async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) {
    await page.reload();
  }
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

export async function waitForSynced(page: Page): Promise<void> {
  await expect(page.getByTestId("sync-badge")).toHaveText(/Synced/, { timeout: 60_000 });
}

/** Creates a top-level page with a title and a first paragraph. Returns its route (`#/page/<id>`). */
export async function createPage(page: Page, title: string, body: string): Promise<string> {
  const view = await openNewPage(page, () => page.getByTestId("new-page").click());
  await view.getByTestId("page-title").fill(title);
  const ed = view.locator(".bn-editor");
  await ed.click();
  await page.keyboard.type(body);
  await expect(ed).toContainText(body);
  return new URL(page.url()).hash;
}

/** Adds a subpage under the sidebar row titled `parentTitle` and names it. Returns its route. */
export async function addSubpage(page: Page, parentTitle: string, title: string): Promise<string> {
  const view = await openNewPage(page, () => treeRow(page, parentTitle).getByTestId("add-subpage").click());
  await view.getByTestId("page-title").fill(title);
  return new URL(page.url()).hash;
}

/**
 * Clicks something that creates a page and routes to it, and returns the new page's view once it
 * is shown. Routing runs on `hashchange`, after the click returns: without this wait, typing
 * right after the click can land in the previous page's title (the intermittent failure seen
 * while merging #14, reproducible by delaying `hashchange`).
 */
async function openNewPage(page: Page, click: () => Promise<void>): Promise<Locator> {
  const before = new URL(page.url()).hash;
  await click();
  await expect.poll(() => new URL(page.url()).hash).not.toBe(before);
  const id = new URL(page.url()).hash.replace("#/page/", "");
  const view = page.locator(`[data-testid="page"][data-page-id="${id}"]`);
  await expect(view).toBeVisible();
  return view;
}

/** Invites `person` to the open page through its Share panel. `level` is the label shown, such as "Can edit". */
export async function sharePage(page: Page, person: string, level: string): Promise<void> {
  const panel = page.getByTestId("share-panel");
  // The people list is fetched when the panel opens.
  await expect(panel.getByTestId("share-person").locator("option", { hasText: person })).toHaveCount(1);
  await panel.getByTestId("share-person").selectOption({ label: person });
  await panel.getByTestId("share-level").selectOption({ label: level });
  await panel.getByTestId("share-invite").click();
  await expect(panel.getByTestId("share-entry").filter({ hasText: person })).toBeVisible();
}

export function editor(page: Page) {
  return page.locator(".bn-editor");
}

/** Editor text without other people's cursor labels, which are rendered inline. */
export function editorText(page: Page): Promise<string> {
  return editor(page).evaluate((el) => {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".bn-collaboration-cursor__base").forEach((c) => c.remove());
    return clone.textContent ?? "";
  });
}

export function treeRow(page: Page, title: string) {
  return page.getByTestId("tree-row").filter({ hasText: title });
}
