import { expect, type Page } from "@playwright/test";

export async function openApp(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(page.getByTestId("new-page")).toBeVisible();
}

/** Waits until the service worker controls the page, so later reloads work offline. */
export async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) {
    await page.reload();
  }
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
}

export async function waitForSynced(page: Page): Promise<void> {
  await expect(page.getByTestId("sync-badge")).toHaveText(/Synced/, {
    timeout: 60_000,
  });
}

export async function createPage(
  page: Page,
  title: string,
  body: string,
): Promise<string> {
  await page.getByTestId("new-page").click();
  await page.getByTestId("page-title").fill(title);
  const bodyEditor = editor(page);
  await bodyEditor.click();
  await page.keyboard.type(body);
  await expect(bodyEditor).toContainText(body);
  return new URL(page.url()).hash;
}

export function editor(page: Page) {
  return page.locator(".bn-editor");
}

/** Editor text without other users' cursor labels, which are rendered inline. */
export function editorText(page: Page): Promise<string> {
  return editor(page).evaluate((el) => {
    const clone = el.cloneNode(true);
    if (!(clone instanceof Element))
      throw new Error("editor clone is not an element");
    clone
      .querySelectorAll(".bn-collaboration-cursor__base")
      .forEach((c) => c.remove());
    return clone.textContent ?? "";
  });
}

export function treeRow(page: Page, title: string) {
  return page.getByTestId("tree-row").filter({ hasText: title });
}

/** The sidebar as "depth:title" lines, in display order. */
export async function treeShape(page: Page): Promise<string[]> {
  return page.getByTestId("tree-row").evaluateAll((rows) =>
    rows.map((r) => {
      const depth = r instanceof HTMLElement ? r.dataset.depth : undefined;
      return `${depth}:${r.querySelector(".tree-link")?.lastChild?.textContent ?? ""}`;
    }),
  );
}

/** Drags a sidebar item onto another: into it, or just before/after it. */
export async function dragTreeItem(
  page: Page,
  source: string,
  target: string,
  where: "inside" | "before" | "after",
) {
  const s = (await treeRow(page, source).locator(".tree-link").boundingBox())!;
  const t = (await treeRow(page, target).boundingBox())!;
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
  await page.mouse.down();
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2 + 12, {
    steps: 4,
  });
  const y =
    where === "inside"
      ? t.y + t.height / 2
      : where === "before"
        ? t.y + 3
        : t.y + t.height - 3;
  await page.mouse.move(t.x + t.width / 2, y, { steps: 10 });
  await page.mouse.up();
}

export async function createTitledPage(
  page: Page,
  title: string,
): Promise<void> {
  await page.getByTestId("new-page").click();
  await page.getByTestId("page-title").fill(title);
  await expect(treeRow(page, title)).toBeVisible();
}
