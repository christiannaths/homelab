// Signing out (issue #113, ADR-PLAT-004): the App switcher's Sign out in every app, and the
// accounts site's own, sign this browser out of every app at once and show the sign-in page.
import type { HomeServer } from "@homelab/home-server";
import type { Browser, BrowserContext } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  ACCOUNTS_URL,
  ADA,
  BOB,
  ENCYCLOPEDIA_URL,
  HOME_URL,
  launchChromium,
  newDevice,
  NOTES_URL,
  onSignInPage,
  signIn,
  startHome,
  tab,
  typePassword,
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

const APPS = [
  { name: "Home", url: HOME_URL },
  { name: "Notes", url: NOTES_URL },
  { name: "Encyclopedia", url: ENCYCLOPEDIA_URL },
];

/** Resolves once the app, opened in a new tab of the browser, turns out to be signed out. */
async function signedOutOf(
  context: BrowserContext,
  url: string,
): Promise<void> {
  const page = await context.newPage();
  await page.goto(url);
  // Once it has been opened, the Encyclopedia's title page opens from its service worker
  // without asking anyone, as it keeps nothing private yet. The gateway then turns its requests
  // away, and the switcher hides.
  if (url === ENCYCLOPEDIA_URL && new URL(page.url()).origin === url) {
    expect(
      await page.evaluate(
        async () => (await fetch("/not-cached", { redirect: "manual" })).type,
      ),
    ).toBe("opaqueredirect");
    await expect.poll(() => tab(page).count()).toBe(0);
  } else {
    await onSignInPage(page);
  }
}

for (const app of APPS)
  describe(`Sign out in ${app.name}'s App switcher`, () => {
    it("signs this browser out of every app, other tabs included, and leaves other browsers signed in", async () => {
      const page = await newDevice(browser);
      await signIn(page, ADA);
      const otherTab = await page.context().newPage();
      await otherTab.goto(NOTES_URL);
      await tab(otherTab).waitFor();
      const otherBrowser = await newDevice(browser);
      await signIn(otherBrowser, ADA);

      await page.goto(app.url);
      await tab(page).click();
      await page.getByRole("menuitem", { name: "Sign out" }).click();
      await onSignInPage(page);

      await otherTab.reload();
      await onSignInPage(otherTab);
      for (const { url } of APPS) await signedOutOf(page.context(), url);

      await otherBrowser.goto(app.url);
      await tab(otherBrowser).waitFor();
      expect(new URL(otherBrowser.url()).origin).toBe(app.url);
    });

    it("comes back to the app on signing in again", async () => {
      const page = await newDevice(browser);
      await signIn(page, ADA);
      await page.goto(`${app.url}/`);
      await tab(page).click();
      await page.getByRole("menuitem", { name: "Sign out" }).click();
      await onSignInPage(page);
      await typePassword(page, ADA);
      await page.waitForURL(`${app.url}/`);
      await tab(page).waitFor();
    });
  });

describe("signing out on the accounts site", () => {
  it("from the account page shows the sign-in page, signed out of every app", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    await page.goto(ACCOUNTS_URL);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await onSignInPage(page);
    await signedOutOf(page.context(), HOME_URL);
  });

  it("from the no-access page lets someone else sign in", async () => {
    const page = await newDevice(browser);
    await signIn(page, BOB);
    await page.goto(`${NOTES_URL}/`);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await onSignInPage(page);
    await typePassword(page, ADA);
    await page.goto(`${NOTES_URL}/`);
    await page.getByText(`Signed in as ${ADA.name}`).waitFor();
  });

  it("is never a link: opening the sign-out address signs nobody out", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    const response = await page.goto(`${ACCOUNTS_URL}/sign-out`);
    expect(response?.status()).toBe(405);
    await page.goto(HOME_URL);
    await page.getByRole("list", { name: "Your apps" }).waitFor();
  });
});
