// Home in a real Chromium, behind the homelab gateway and the real VoidAuth image, next to Notes
// and the Encyclopedia: the apps each account sees, and opening offline (issue #87, ADR-PLAT-004).
import type { HomeServer } from "@homelab/home-server";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  ADA,
  ADMIN,
  BOB,
  ENCYCLOPEDIA_URL,
  HOME_URL,
  launchChromium,
  newDevice,
  NOTES_URL,
  signIn,
  startHome,
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

/** Each tile's name, where it leads and whether its icon loaded. */
function tiles(page: Page) {
  return page
    .getByRole("list", { name: "Your apps" })
    .getByRole("link")
    .evaluateAll((links) =>
      links.map((link) => {
        const icon = link.querySelector("img");
        return {
          name: link.textContent?.trim(),
          href: link.getAttribute("href"),
          icon: icon ? icon.complete && icon.naturalWidth > 0 : null,
        };
      }),
    );
}

describe("Home's tiles", () => {
  it("show only Home to an account with no apps", async () => {
    const page = await newDevice(browser);
    await signIn(page, BOB);
    expect(await tiles(page)).toEqual([
      { name: "Home", href: `${HOME_URL}/`, icon: true },
    ]);
  });

  it("show each app the account has, with its manifest's name and icon", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    await page.waitForFunction(
      () =>
        document.images.length === 3 &&
        [...document.images].every(
          (image) => image.complete && image.naturalWidth > 0,
        ),
    );
    expect(await tiles(page)).toEqual([
      { name: "Encyclopedia", href: `${ENCYCLOPEDIA_URL}/`, icon: true },
      { name: "Home", href: `${HOME_URL}/`, icon: true },
      { name: "Notes", href: `${NOTES_URL}/`, icon: true },
    ]);

    await page.getByRole("link", { name: "Notes" }).click();
    await page.waitForURL(`${NOTES_URL}/`);
    await page.getByText(`Signed in as ${ADA.name}`).waitFor();
  });

  it("show an admin only the apps they were given, not every app they can reach", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADMIN);
    expect((await tiles(page)).map((tile) => tile.name)).toEqual([
      "Encyclopedia",
      "Home",
    ]);
  });
});

describe("offline", () => {
  it("opens with no network once installed, with the tiles it last showed", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    await waitUntilOfflineReady(page);

    await page.context().setOffline(true);
    await page.reload();
    await page.getByText("Offline", { exact: true }).waitFor();
    expect((await tiles(page)).map((tile) => tile.name)).toEqual([
      "Encyclopedia",
      "Home",
      "Notes",
    ]);

    await page.context().setOffline(false);
    await page
      .getByText("Offline", { exact: true })
      .waitFor({ state: "detached" });
  });
});
