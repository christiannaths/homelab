// Signing in through the gateway on the accounts service's own pages (issue #111), and the App
// switcher beyond our apps (issue #103): on the accounts site, and on a stand-in bundled app with
// a strict security policy.
import type { HomeServer } from "@homelab/home-server";
import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  ACCOUNTS_URL,
  ADA,
  BOB,
  ENCYCLOPEDIA_URL,
  GRACE,
  HOME_URL,
  launchChromium,
  menuItems,
  newDevice,
  NOTES_URL,
  onSignInPage,
  securityPolicyErrors,
  signIn,
  startHome,
  tab,
  typePassword,
  VAULT_URL,
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

describe("signing in", () => {
  it("by email, in any letter case, comes straight back to the app the person opened", async () => {
    const page = await newDevice(browser);
    await page.goto(`${NOTES_URL}/`);
    await onSignInPage(page);
    await typePassword(page, { ...ADA, email: "Ada@Example.COM" });
    await page.waitForURL(`${NOTES_URL}/`);
    await page.getByText(`Signed in as ${ADA.name}`).waitFor();
  });

  it("opens every app the person has, with no second sign-in", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    for (const url of [NOTES_URL, ENCYCLOPEDIA_URL]) {
      await page.goto(url);
      await tab(page).waitFor();
      expect(new URL(page.url()).origin).toBe(url);
    }
  });

  it("shows a wrong password on the same page", async () => {
    const page = await newDevice(browser);
    await page.goto(HOME_URL);
    await onSignInPage(page);
    await typePassword(page, { ...ADA, password: "not-her-password" });
    await page
      .getByRole("alert")
      .getByText("Wrong email or password.")
      .waitFor();
    expect(new URL(page.url()).pathname).toBe("/sign-in");
    expect(await page.getByLabel("Email").inputValue()).toBe(ADA.email);

    await typePassword(page, ADA);
    await page.waitForURL(`${HOME_URL}/`);
  });

  it("is a page in the homelab look, following the device's light or dark setting", async () => {
    const page = await newDevice(browser);
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(HOME_URL);
    await onSignInPage(page);
    const background = () =>
      page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(await background()).toBe("rgb(255, 255, 255)");
    await page.emulateMedia({ colorScheme: "dark" });
    expect(await background()).toBe("rgb(31, 31, 31)");
  });
});

describe("an app the person has no App access to", () => {
  it("shows the accounts service's no-access page, and nothing from the app", async () => {
    const page = await newDevice(browser);
    await signIn(page, BOB);
    const response = await page.goto(`${NOTES_URL}/`);
    expect(response?.status()).toBe(403);
    expect(page.url()).toBe(`${NOTES_URL}/`);
    await page
      .getByRole("heading", { name: "You don't have access to Notes" })
      .waitFor();
    const api = await page.evaluate(
      async () => (await fetch("/api/session")).status,
    );
    expect(api).toBe(403);
  });
});

describe("the accounts site", () => {
  it("shows the App switcher on the account page, with no security-policy errors", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    const errors = securityPolicyErrors(page);
    await page.goto(ACCOUNTS_URL);
    await page.getByRole("heading", { name: ADA.name }).waitFor();
    await tab(page).waitFor();
    expect(await menuItems(page)).toEqual([
      "Home",
      "Encyclopedia",
      "Notes",
      "Account settings",
      "Sign out",
    ]);
    await page.getByRole("menuitem", { name: "Home" }).click();
    await page.waitForURL(`${HOME_URL}/`);
    expect(errors).toEqual([]);
  });

  it("shows no switcher on the sign-in page", async () => {
    const page = await newDevice(browser);
    await page.goto(HOME_URL);
    await onSignInPage(page);
    await page.getByLabel("Email").waitFor();
    await page.waitForLoadState("networkidle");
    expect(await page.locator("homelab-switcher").count()).toBe(1);
    expect(await tab(page).count()).toBe(0);
  });
});

describe("a bundled app with a strict security policy", () => {
  it("shows the App switcher, with its icons and no security-policy errors", async () => {
    const page = await newDevice(browser);
    await signIn(page, GRACE);
    const errors = securityPolicyErrors(page);
    await page.goto(VAULT_URL);
    await tab(page).waitFor();
    expect(await menuItems(page)).toContain("VaultCurrent");
    await expect
      .poll(() =>
        page.evaluate(() =>
          [
            ...(document
              .querySelector("homelab-switcher")
              ?.shadowRoot?.querySelectorAll("img") ?? []),
          ].every((image) => image.complete && image.naturalWidth > 0),
        ),
      )
      .toBe(true);
    expect(errors).toEqual([]);
  });
});
