// The App switcher with no connection (issues #91 and #102): it shows the answer Home last gave, in
// the page each app's service worker saved with the switcher in it, greys out what needs a
// connection, and catches up once back online.
import { changeGroups } from "@homelab/voidauth-fixtures";
import type { HomeServer } from "@homelab/home-server";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  ENCYCLOPEDIA_URL,
  goOffline,
  goOnline,
  GRACE,
  HEDY,
  HOME_URL,
  initialsInMenu,
  launchChromium,
  menuItems,
  newDevice,
  NOTES_URL,
  signIn,
  signInAsAdmin,
  startHome,
  tab,
  waitUntilOfflineReady,
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

/**
 * Opens the app and waits until its service worker has saved its page with the switcher in it, as
 * the gateway sent it, for opening offline.
 */
async function visit(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await tab(page).waitFor();
  await waitUntilOfflineReady(page);
  const kept = () =>
    page.evaluate(async () => {
      const saved = await caches.match("/index.html", { ignoreSearch: true });
      return (await saved?.text())?.includes("homelab-switcher") ?? false;
    });
  for (let i = 0; !(await kept()); i++) {
    if (i === 50) throw new Error(`${url} saved no page with the switcher`);
    await page.waitForTimeout(200);
  }
}

/** Whether every icon in the switcher's menu has loaded. */
const iconsLoaded = (page: Page) =>
  page.evaluate(() => {
    const images = [
      ...(document
        .querySelector("homelab-switcher")
        ?.shadowRoot?.querySelectorAll("img") ?? []),
    ];
    return (
      images.length > 0 &&
      images.every((image) => image.complete && image.naturalWidth > 0)
    );
  });

const menuItem = (page: Page, name: string) =>
  page
    .getByRole("menu", { name: "Apps and sign out" })
    .getByRole("menuitem", { name });

describe("the App switcher offline", () => {
  let page: Page;
  let offline = false;

  beforeAll(async () => {
    page = await newDevice(browser);
    await signIn(page, GRACE);
    // One online visit to each app.
    await visit(page, HOME_URL);
    await visit(page, NOTES_URL);
    await visit(page, ENCYCLOPEDIA_URL);
    await goOffline(page, inject("composeEnv"));
    offline = true;
  });
  afterAll(async () => {
    if (offline) await goOnline(page, inject("composeEnv"));
    await page.context().close();
  });

  for (const app of [
    { name: "Home", url: HOME_URL },
    { name: "Notes", url: NOTES_URL },
    { name: "Encyclopedia", url: ENCYCLOPEDIA_URL },
  ])
    it(`shows the tab and the last list of apps in ${app.name}`, async () => {
      await page.goto(app.url);
      await tab(page).waitFor();
      expect(await initialsInMenu(page)).toBe("GH");
      expect(await menuItems(page)).toEqual(
        ["Home", "Encyclopedia", "Notes", "Vault"]
          .map((name) => (name === app.name ? `${name}Current` : name))
          .concat(
            "Account settingsNeeds a connection",
            "Sign outNeeds a connection",
          ),
      );
      await expect.poll(() => iconsLoaded(page)).toBe(true);
    });

  it("greys out an app that doesn't open offline, which can't be opened", async () => {
    await page.goto(HOME_URL);
    await menuItems(page);
    const vault = menuItem(page, "Vault");
    expect(await vault.getAttribute("aria-disabled")).toBe("true");
    expect(await vault.getAttribute("href")).toBe(null);
    // Forced, as a person could still click it; Playwright otherwise waits for it to be enabled.
    await vault.click({ force: true });
    expect(page.url()).toBe(`${HOME_URL}/`);
    expect(await menuItem(page, "Notes").getAttribute("aria-disabled")).toBe(
      null,
    );
  });

  it("greys out the same app's tile in Home", async () => {
    await page.goto(HOME_URL);
    const tiles = page.getByRole("list", { name: "Your apps" });
    const vault = tiles.getByRole("link", { name: "Vault" });
    await tiles.waitFor();
    expect(await vault.count()).toBe(0);
    expect(
      await tiles.locator('[aria-disabled="true"]').textContent(),
    ).toContain("Vault");
    expect(
      await tiles.getByRole("link", { name: "Notes" }).getAttribute("href"),
    ).toBe(`${NOTES_URL}/`);
  });

  it("greys out Sign out, which needs a connection", async () => {
    await page.goto(HOME_URL);
    await menuItems(page);
    const signOut = menuItem(page, "Sign out");
    expect(await signOut.getAttribute("aria-disabled")).toBe("true");
    expect(await signOut.getAttribute("href")).toBe(null);
  });

  it("stops greying out once the device is back online", async () => {
    await page.goto(HOME_URL);
    await menuItems(page);
    await goOnline(page, inject("composeEnv"));
    offline = false;
    await expect
      .poll(() => menuItem(page, "Vault").getAttribute("aria-disabled"))
      .toBe(null);
    expect(await menuItems(page)).toContain("Sign out");
  });
});

describe("the App switcher catching up", () => {
  it("shows apps granted or removed on the next online load or coming back online", async () => {
    const admin = await signInAsAdmin(inject("dataDir"));
    const page = await newDevice(browser);
    try {
      await signIn(page, HEDY);
      expect(await menuItems(page)).toEqual([
        "HomeCurrent",
        "Notes",
        "Account settings",
        "Sign out",
      ]);

      await changeGroups(admin, HEDY.username, (has) => [
        ...has,
        "encyclopedia",
      ]);
      await page.reload();
      await tab(page).waitFor();
      expect(await menuItems(page)).toEqual([
        "HomeCurrent",
        "Encyclopedia",
        "Notes",
        "Account settings",
        "Sign out",
      ]);

      // Only the browser goes offline here: VoidAuth's admin API is reached through the gateway.
      await page.context().setOffline(true);
      await changeGroups(admin, HEDY.username, (has) =>
        has.filter((group) => group !== "notes"),
      );
      await page.context().setOffline(false);
      await expect
        .poll(() => menuItems(page))
        .toEqual([
          "HomeCurrent",
          "Encyclopedia",
          "Account settings",
          "Sign out",
        ]);
    } finally {
      await page.context().close();
      await changeGroups(admin, HEDY.username, () => HEDY.groups);
    }
  });

  it("falls back to the kept answer while Home can't be reached", async () => {
    const page = await newDevice(browser);
    try {
      await signIn(page, GRACE);
      await visit(page, NOTES_URL);
      await home.close();
      try {
        await page.reload();
        await tab(page).waitFor();
        expect(await menuItems(page)).toEqual([
          "Home",
          "Encyclopedia",
          "NotesCurrent",
          "Vault",
          "Account settings",
          "Sign out",
        ]);
      } finally {
        home = await startHome(inject("dataDir"));
      }
    } finally {
      await page.context().close();
    }
  });
});
