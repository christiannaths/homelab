// The App switcher in the other apps, which the gateway adds to their pages (issues #89, #90 and
// #102): the same person as in Home, and the app marked as current. Its Sign out is in
// sign-out.test.ts.
import type { HomeServer } from "@homelab/home-server";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  ADA,
  ENCYCLOPEDIA_URL,
  initialsInMenu,
  launchChromium,
  menuItems,
  newDevice,
  NOTES_URL,
  signIn,
  startHome,
  tab,
} from "./stack.ts";

let home: HomeServer;
let browser: Browser;

beforeAll(async () => {
  home = await startHome();
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
  });
