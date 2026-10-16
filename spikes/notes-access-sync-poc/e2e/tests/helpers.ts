import { expect, type Browser, type Page } from "@playwright/test";

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
  await page.getByTestId("new-page").click();
  await page.getByTestId("page-title").fill(title);
  const ed = editor(page);
  await ed.click();
  await page.keyboard.type(body);
  await expect(ed).toContainText(body);
  return new URL(page.url()).hash;
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
