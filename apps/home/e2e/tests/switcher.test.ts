// The App switcher in a real Chromium behind the gateway and VoidAuth (issues #88, #102 and #104):
// the tab at the top of every app, the menu it opens, signing out of every app, the keyboard, and
// how it renders.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { HomeServer } from "@homelab/home-server";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  ACCOUNTS_URL,
  ADA,
  ADMIN,
  confirmSignOut,
  DANA,
  ENCYCLOPEDIA_URL,
  HOME_URL,
  initialsInMenu,
  launchChromium,
  menuItems,
  newDevice,
  NOTES_URL,
  onVoidAuthSignIn,
  signIn,
  startHome,
  tab,
  VOIDAUTH_SESSION_COOKIE,
} from "./stack.ts";

let home: HomeServer;
let browser: Browser;

beforeAll(async () => {
  home = await startHome(inject("dataDir"));
  browser = await launchChromium(inject("gatewayCaSpki"));
});
afterAll(async () => {
  await browser?.close();
  await home?.close();
});

const APPS = [
  { name: "Home", url: HOME_URL, dir: "home" },
  { name: "Notes", url: NOTES_URL, dir: "notes" },
  { name: "Encyclopedia", url: ENCYCLOPEDIA_URL, dir: "encyclopedia" },
];

const tabBackground = (page: Page) =>
  tab(page).evaluate((button) => getComputedStyle(button).backgroundColor);

const panelStyle = (page: Page) =>
  page.getByRole("menu").evaluate((menu) => {
    const panel = menu.parentElement ?? menu;
    const style = getComputedStyle(panel);
    return {
      background: style.backgroundColor,
      color: style.color,
      font: style.fontFamily,
    };
  });

/** Where the page's own content is, which the switcher must not move. */
const layout = (page: Page) =>
  page.evaluate(() =>
    [document.body, ...document.querySelectorAll("body *")]
      .slice(0, 50)
      .map((node) => JSON.stringify(node.getBoundingClientRect())),
  );

/** Every file of an app's web build, as served. */
async function buildFiles(dir: string): Promise<string[]> {
  const root = fileURLToPath(
    new URL(`../../../${dir}/web/dist`, import.meta.url),
  );
  const files = await readdir(root, { recursive: true, withFileTypes: true });
  return Promise.all(
    files
      .filter((file) => file.isFile() && /\.(html|js)$/.test(file.name))
      .map((file) => readFile(path.join(file.parentPath, file.name), "utf8")),
  );
}

describe("the tab", () => {
  for (const app of APPS)
    it(`hangs from the top centre of ${app.name} at 24×24, over the page`, async () => {
      const page = await newDevice(browser);
      await signIn(page, ADA);
      await page.goto(app.url);
      await tab(page).waitFor();
      const box = await tab(page).boundingBox();
      const viewport = page.viewportSize();
      expect(box?.width).toBe(24);
      expect(box?.height).toBe(24);
      expect(box?.y).toBe(0);
      expect(
        Math.abs((box?.x ?? 0) + 12 - (viewport?.width ?? 0) / 2),
      ).toBeLessThanOrEqual(1);

      const withTab = await layout(page);
      await page.evaluate(() =>
        document.querySelector("homelab-switcher")?.remove(),
      );
      expect(await layout(page)).toEqual(withTab);
    });

  for (const app of APPS)
    it(`comes from the gateway alone, with nothing for it in ${app.name}`, async () => {
      for (const file of await buildFiles(app.dir))
        expect(file).not.toContain("apps and sign out");
      const page = await newDevice(browser);
      await signIn(page, ADA);
      await page.goto(app.url);
      const html = await page.evaluate(async () =>
        (await fetch(location.href, { cache: "no-store" })).text(),
      );
      expect(html.match(/homelab-switcher/g)?.length).toBeGreaterThan(0);
      expect(html.match(/<script>/g)).toHaveLength(1);
    });

  it("opens the menu, which shows the person's initials in a colour from their username alone", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    expect(await initialsInMenu(page)).toBe("AL");
    const colour = (on: Page) =>
      on.evaluate(() => {
        const avatar = document
          .querySelector("homelab-switcher")
          ?.shadowRoot?.querySelector(".avatar");
        return avatar ? getComputedStyle(avatar).backgroundColor : null;
      });
    const other = await newDevice(browser);
    await signIn(other, ADA);
    await initialsInMenu(other);
    expect(await colour(other)).toBe(await colour(page));

    const dana = await newDevice(browser);
    await signIn(dana, DANA);
    expect(await initialsInMenu(dana)).toBe("DS");
    expect(await colour(dana)).not.toBe(await colour(page));
  });

  it("follows the device's light or dark setting", async () => {
    const page = await newDevice(browser);
    await page.emulateMedia({ colorScheme: "light" });
    await signIn(page, ADA);
    expect(await tabBackground(page)).toBe("rgb(255, 255, 255)");
    await tab(page).click();
    expect((await panelStyle(page)).background).toBe("rgb(255, 255, 255)");

    await page.emulateMedia({ colorScheme: "dark" });
    // Away from the tab, which is lighter under the pointer.
    await page.mouse.move(0, 400);
    await expect
      .poll(async () => (await panelStyle(page)).background)
      .toBe("rgb(31, 31, 31)");
    expect(await tabBackground(page)).toBe("rgb(31, 31, 31)");
  });

  it("is untouched by the page's styles", async () => {
    const page = await newDevice(browser);
    await page.emulateMedia({ colorScheme: "light" });
    await signIn(page, ADA);
    await page.addStyleTag({
      content: `
        * { color: red !important; font-family: serif !important; }
        button { background: lime !important; }
        div { background: yellow !important; }
      `,
    });
    expect(await tabBackground(page)).toBe("rgb(255, 255, 255)");
    await tab(page).click();
    const style = await panelStyle(page);
    expect(style.background).toBe("rgb(255, 255, 255)");
    expect(style.color).toBe("rgb(33, 37, 41)");
    expect(style.font).toMatch(/^-apple-system/);
  });
});

describe("the menu", () => {
  it("lists the person, Home, their other apps by name, and Sign out", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    await tab(page).click();
    await page.getByText(ADA.name ?? "", { exact: true }).waitFor();
    await page.getByText(ADA.email ?? "", { exact: true }).waitFor();
    expect(await menuItems(page)).toEqual([
      "HomeCurrent",
      "Encyclopedia",
      "Notes",
      "Account settings",
      "Sign out",
    ]);
    expect(
      await page
        .getByRole("menuitem", { name: /^Home/ })
        .getAttribute("aria-current"),
    ).toBe("page");
  });

  it("leaves out apps the person has no access to", async () => {
    const page = await newDevice(browser);
    await signIn(page, DANA);
    expect(await menuItems(page)).toEqual([
      "HomeCurrent",
      "Notes",
      "Account settings",
      "Sign out",
    ]);

    const admin = await newDevice(browser);
    await signIn(admin, ADMIN);
    expect(await menuItems(admin)).toEqual([
      "HomeCurrent",
      "Encyclopedia",
      "Account settings",
      "Sign out",
    ]);
  });

  it("opens an app in one click", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    await tab(page).click();
    await page.getByRole("menuitem", { name: "Encyclopedia" }).click();
    await page.waitForURL(`${ENCYCLOPEDIA_URL}/`);
  });

  it("opens the person's account settings on VoidAuth", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    await tab(page).click();
    await page.getByRole("menuitem", { name: "Account settings" }).click();
    // VoidAuth's own page for the signed-in account, not its sign-in page.
    await page.waitForURL(`${ACCOUNTS_URL}/`);
    await page.waitForLoadState("networkidle");
    expect(new URL(page.url()).pathname).toBe("/");
  });

  it("signs the homelab account out of every app", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    await tab(page).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await confirmSignOut(page);
    await onVoidAuthSignIn(page);

    for (const app of [HOME_URL, NOTES_URL, ENCYCLOPEDIA_URL]) {
      const other = await page.context().newPage();
      await other.goto(app);
      await onVoidAuthSignIn(other);
    }
  });

  it("closes on Escape and on a click outside it", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    const menu = page.getByRole("menu");
    await tab(page).click();
    await menu.waitFor();
    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "hidden" });

    await tab(page).click();
    await menu.waitFor();
    await page.getByRole("heading", { name: "Home" }).click();
    await menu.waitFor({ state: "hidden" });
  });

  it("works with the keyboard alone", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    const focused = () =>
      page.evaluate(() => {
        const host = document.querySelector("homelab-switcher");
        const inner = host?.shadowRoot?.activeElement;
        return (
          inner?.getAttribute("aria-label") ??
          inner?.textContent?.trim() ??
          document.activeElement?.tagName
        );
      });
    await tab(page).focus();
    await page.keyboard.press("Enter");
    expect(await focused()).toBe("HomeCurrent");
    await page.keyboard.press("ArrowDown");
    expect(await focused()).toBe("Encyclopedia");
    await page.keyboard.press("End");
    expect(await focused()).toBe("Sign out");
    await page.keyboard.press("ArrowDown");
    expect(await focused()).toBe("HomeCurrent");
    await page.keyboard.press("Escape");
    await page.getByRole("menu").waitFor({ state: "hidden" });
    expect(await focused()).toBe("Ada Lovelace: apps and sign out");

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForURL(`${ENCYCLOPEDIA_URL}/`);
  });
});

describe("signed out", () => {
  it("hides once Home says the person is signed out", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    await tab(page).waitFor();
    await page.context().clearCookies({ name: VOIDAUTH_SESSION_COOKIE });
    // A new switcher asks Home again, as one does on every page load.
    await page.evaluate(() =>
      document.documentElement.append(
        document.createElement("homelab-switcher"),
      ),
    );
    await tab(page).first().waitFor({ state: "hidden" });
    expect(await tab(page).count()).toBe(0);
  });
});
