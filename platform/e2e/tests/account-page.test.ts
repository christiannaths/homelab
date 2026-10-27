// A person's account page on the accounts site (issue #114): reached from the App switcher, showing
// their apps, and changing their own name and password.
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  ACCOUNTS_URL,
  ADA,
  ADMIN,
  launchChromium,
  loadPeople,
  newDevice,
  NOTES_URL,
  onSignInPage,
  signIn,
  tab,
  typePassword,
  type Account,
} from "./stack.ts";

let browser: Browser;

beforeAll(async () => {
  browser = await launchChromium(inject("gatewayCaSpki"));
});
afterAll(async () => {
  await browser?.close();
});

/** Opens the account page from the App switcher, on whatever app the page is on. */
async function openAccountSettings(page: Page): Promise<void> {
  await tab(page).click();
  await page.getByRole("menuitem", { name: "Account settings" }).click();
  await page.waitForURL(`${ACCOUNTS_URL}/`);
}

/** The apps on the account page, each as its name and the person's level in it. */
function appsListed(page: Page): Promise<string[]> {
  return page
    .getByRole("list", { name: "Your apps" })
    .getByRole("listitem")
    .evaluateAll((items) =>
      items.map((item) => item.textContent?.replace(/\s+/g, " ").trim() ?? ""),
    );
}

/** A person of the test's own, so changing their account leaves everyone else's alone. */
async function newPerson(account: Account): Promise<Account> {
  await loadPeople(inject("composeEnv"), [account]);
  return account;
}

describe("the account page", () => {
  it("opens from Account settings, with the person's name, email, and apps with their level and icon", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    await openAccountSettings(page);
    await page.getByRole("heading", { name: ADA.name }).waitFor();
    await page.getByRole("main").getByText(ADA.email).waitFor();
    expect(await appsListed(page)).toEqual([
      "Encyclopedia Member",
      "Notes Admin",
    ]);
    await expect
      .poll(() =>
        page
          .getByRole("list", { name: "Your apps" })
          .locator("img")
          .evaluateAll((images) =>
            images.map(
              (image) =>
                image instanceof HTMLImageElement &&
                image.complete &&
                image.naturalWidth > 0,
            ),
          ),
      )
      .toEqual([true, true]);
  });

  it("sends a signed-out browser to sign in, and back to the account page", async () => {
    const page = await newDevice(browser);
    await page.goto(ACCOUNTS_URL);
    await onSignInPage(page);
    await typePassword(page, ADA);
    await page.waitForURL(`${ACCOUNTS_URL}/`);
    await page.getByRole("heading", { name: ADA.name }).waitFor();
  });

  it("changes the person's name, which apps show on the next request", async () => {
    const person = await newPerson({
      email: "joan@example.com",
      password: "ember-lantern-quartz-38",
      name: "Joan Clarke",
      apps: { notes: "member" },
    });
    const page = await newDevice(browser);
    await signIn(page, person);
    await openAccountSettings(page);
    await page.getByLabel("Name").fill("Joan Murray");
    await page.getByRole("button", { name: "Change name" }).click();
    await page.getByRole("status").getByText("Your name is changed.").waitFor();
    await page.getByRole("heading", { name: "Joan Murray" }).waitFor();

    await page.goto(`${NOTES_URL}/`);
    await page.getByText("Signed in as Joan Murray").waitFor();
  });

  it("changes the password with the current one, after which only the new one signs in", async () => {
    const person = await newPerson({
      email: "katherine@example.com",
      password: "thistle-copper-meadow-19",
      name: "Katherine Johnson",
      apps: {},
    });
    const page = await newDevice(browser);
    await signIn(page, person);
    await openAccountSettings(page);

    await page.getByLabel("Current password").fill("not-her-password");
    await page.getByLabel("New password").fill("orbit-and-back");
    await page.getByRole("button", { name: "Change password" }).click();
    await page
      .getByRole("alert")
      .getByText("Your current password is wrong.")
      .waitFor();

    await page.getByLabel("Current password").fill(person.password);
    await page.getByLabel("New password").fill("orbit-and-back");
    await page.getByRole("button", { name: "Change password" }).click();
    await page
      .getByRole("status")
      .getByText("Your password is changed.")
      .waitFor();

    const other = await newDevice(browser);
    await other.goto(ACCOUNTS_URL);
    await onSignInPage(other);
    await typePassword(other, person);
    await other
      .getByRole("alert")
      .getByText("Wrong email or password.")
      .waitFor();
    await typePassword(other, { ...person, password: "orbit-and-back" });
    await other.waitForURL(`${ACCOUNTS_URL}/`);
  });

  it("links a homelab admin to the People page", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADMIN);
    await openAccountSettings(page);
    await page.getByRole("link", { name: "People" }).click();
    await page.waitForURL(`${ACCOUNTS_URL}/people`);
    await page.getByRole("heading", { name: "People" }).waitFor();
  });

  it("shows no admin links to anyone else", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    await openAccountSettings(page);
    await page.getByRole("heading", { name: ADA.name }).waitFor();
    expect(await page.getByRole("link", { name: "People" }).count()).toBe(0);
  });
});
