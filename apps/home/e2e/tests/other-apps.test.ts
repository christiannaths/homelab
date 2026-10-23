// The App switcher in the other apps, which the gateway adds to their pages (issues #89, #90 and
// #102): the same person as in Home, the app marked as current, and Sign out signing out every app.
import type { HomeServer } from "@homelab/home-server";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  ADA,
  confirmSignOut,
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

/** The colour of the person's icon in the switcher's menu. */
const iconColour = async (page: Page) => {
  await initialsInMenu(page);
  return page.evaluate(() => {
    const avatar = document
      .querySelector("homelab-switcher")
      ?.shadowRoot?.querySelector(".avatar");
    return avatar ? getComputedStyle(avatar).backgroundColor : null;
  });
};

/** Opens the app in the signed-in page and waits for its App switcher. */
async function open(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await tab(page).waitFor();
}

const APPS = [
  { name: "Notes", url: NOTES_URL },
  { name: "Encyclopedia", url: ENCYCLOPEDIA_URL },
];

for (const app of APPS)
  describe(`the App switcher in ${app.name}`, () => {
    it("shows the person, with the app marked as current", async () => {
      const page = await newDevice(browser);
      await signIn(page, ADA);
      await open(page, app.url);
      expect(await initialsInMenu(page)).toBe("AL");
      const items = await menuItems(page);
      expect(items).toContain(`${app.name}Current`);
      expect(items[0]).toBe("Home");
    });

    it("shows the same icon colour for the person as Home", async () => {
      const page = await newDevice(browser);
      await signIn(page, ADA);
      const inHome = await iconColour(page);
      await open(page, app.url);
      expect(await iconColour(page)).toBe(inHome);
    });

    it("signs the account out of every app", async () => {
      const page = await newDevice(browser);
      await signIn(page, ADA);
      await open(page, app.url);
      await tab(page).click();
      await page.getByRole("menuitem", { name: "Sign out" }).click();
      await confirmSignOut(page);
      await onVoidAuthSignIn(page);

      for (const url of [HOME_URL, NOTES_URL]) {
        const other = await page.context().newPage();
        await other.goto(url);
        await onVoidAuthSignIn(other);
      }
      // Once it has been opened, the Encyclopedia's title page opens from its service worker
      // without asking anyone, as it keeps nothing private yet. The gateway then turns its
      // requests away, and the switcher hides.
      const other = await page.context().newPage();
      await other.goto(ENCYCLOPEDIA_URL);
      if (new URL(other.url()).origin === ENCYCLOPEDIA_URL) {
        expect(
          await other.evaluate(
            async () =>
              (await fetch("/not-cached", { redirect: "manual" })).type,
          ),
        ).toBe("opaqueredirect");
        // The page's switcher shows the kept answer, and hides once Home's answer says signed out.
        await expect.poll(() => tab(other).count()).toBe(0);
      } else {
        await onVoidAuthSignIn(other);
      }
    });
  });
