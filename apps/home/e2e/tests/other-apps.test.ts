// The App switcher in the other apps, each added with Home's one script tag (issues #89 and #90):
// the same user icon as in Home, the app marked as current, and Sign out signing out every app.
import type { HomeServer } from "@homelab/home-server";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  ADA,
  confirmSignOut,
  ENCYCLOPEDIA_URL,
  HOME_URL,
  launchChromium,
  menuItems,
  newDevice,
  NOTES_URL,
  onVoidAuthSignIn,
  signIn,
  startHome,
  userIcon,
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

const iconColour = (page: Page) =>
  userIcon(page).evaluate((icon) => getComputedStyle(icon).backgroundColor);

/** Opens the app in the signed-in page and waits for its App switcher. */
async function open(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await userIcon(page).waitFor();
}

const APPS = [
  { name: "Notes", url: NOTES_URL },
  { name: "Encyclopedia", url: ENCYCLOPEDIA_URL },
];

for (const app of APPS)
  describe(`the App switcher in ${app.name}`, () => {
    it("sits in the app's header, with the app marked as current", async () => {
      const page = await newDevice(browser);
      await signIn(page, ADA);
      await open(page, app.url);
      expect(
        await page.evaluate(
          () =>
            document.querySelector("homelab-switcher")?.closest("header") !==
            null,
        ),
      ).toBe(true);
      expect(await userIcon(page).textContent()).toBe("AL");
      const items = await menuItems(page);
      expect(items).toContain(`${app.name}Current`);
      expect(items[0]).toBe("Home");
    });

    it("shows the same user icon colour as Home", async () => {
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
      await userIcon(page).click();
      await page.getByRole("menuitem", { name: "Sign out" }).click();
      await confirmSignOut(page);
      await onVoidAuthSignIn(page);

      for (const url of [HOME_URL, NOTES_URL]) {
        const tab = await page.context().newPage();
        await tab.goto(url);
        await onVoidAuthSignIn(tab);
      }
      // Once it has been opened, the Encyclopedia's title page opens from its service worker
      // without asking anyone, as it keeps nothing private yet. The gateway then turns its
      // requests away, and the switcher hides.
      const tab = await page.context().newPage();
      await tab.goto(ENCYCLOPEDIA_URL);
      if (new URL(tab.url()).origin === ENCYCLOPEDIA_URL) {
        expect(
          await tab.evaluate(
            async () =>
              (await fetch("/not-cached", { redirect: "manual" })).type,
          ),
        ).toBe("opaqueredirect");
        await tab.waitForLoadState("networkidle");
        expect(await userIcon(tab).count()).toBe(0);
      } else {
        await onVoidAuthSignIn(tab);
      }
    });
  });
