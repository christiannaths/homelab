// The App switcher beyond our apps (issue #103): on VoidAuth's accounts pages, a real third-party
// app with a strict security policy, and on a stand-in bundled app with one too. On VoidAuth's
// pages it also skips the "add a passkey?" question.
import type { HomeServer } from "@homelab/home-server";
import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  ACCOUNTS_URL,
  ADA,
  GRACE,
  HOME_URL,
  launchChromium,
  menuItems,
  newDevice,
  onVoidAuthSignIn,
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

describe("VoidAuth's accounts pages", () => {
  it("show the App switcher, with no security-policy errors", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    const errors = securityPolicyErrors(page);
    await page.goto(ACCOUNTS_URL);
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

  it("show no switcher on the sign-in page", async () => {
    const page = await newDevice(browser);
    await page.goto(HOME_URL);
    await onVoidAuthSignIn(page);
    await page.getByLabel("Username or Email").waitFor();
    await page.waitForLoadState("networkidle");
    expect(await page.locator("homelab-switcher").count()).toBe(1);
    expect(await tab(page).count()).toBe(0);
  });

  it("never ask to add a passkey after signing in, and still offer passkeys in Account settings", async () => {
    const page = await newDevice(browser);
    await page.goto(HOME_URL);
    await onVoidAuthSignIn(page);
    await typePassword(page, ADA);
    await page.getByRole("list", { name: "Your apps" }).waitFor();
    expect(
      await page.getByRole("button", { name: "Skip", exact: true }).count(),
    ).toBe(0);

    await tab(page).click();
    await page.getByRole("menuitem", { name: "Account settings" }).click();
    await page.waitForURL(`${ACCOUNTS_URL}/`);
    await page
      .getByRole("button", { name: /Register Passkey/i })
      .first()
      .waitFor();
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
