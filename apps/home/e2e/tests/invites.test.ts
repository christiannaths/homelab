// Invites (issue #115): a homelab admin makes one on the People page, passes its link on, and the
// invited person joins with it and reaches their apps. A used or cancelled link can't be used.
import type { HomeServer } from "@homelab/home-server";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  ACCOUNTS_URL,
  ADMIN,
  HOME_URL,
  launchChromium,
  newDevice,
  NOTES_URL,
  signIn,
  startHome,
} from "./stack.ts";

let home: HomeServer;
let browser: Browser;
let admin: Page;

beforeAll(async () => {
  home = await startHome(inject("dataDir"));
  browser = await launchChromium(inject("gatewayCaSpki"));
  admin = await newDevice(browser);
  await signIn(admin, ADMIN);
});
afterAll(async () => {
  await browser?.close();
  await home?.close();
});

/** Makes an invite on the People page as the admin, and returns the link the page shows. */
async function makeInvite(
  email: string,
  apps: Record<string, "member" | "admin">,
): Promise<string> {
  await admin.goto(`${ACCOUNTS_URL}/people`);
  await admin.getByLabel("Email").fill(email);
  for (const [app, level] of Object.entries(apps))
    await admin.getByLabel(app, { exact: true }).selectOption(level);
  await admin.getByRole("button", { name: "Make invite" }).click();
  await admin.getByRole("heading", { name: `Invite for ${email}` }).waitFor();
  return admin.getByLabel("Invite link").inputValue();
}

/** The "can't be used" page, at the link on a device of its own. */
async function cantBeUsed(link: string): Promise<void> {
  const page = await newDevice(browser);
  await page.goto(link);
  await page
    .getByRole("heading", { name: "This invite can't be used" })
    .waitFor();
}

describe("an invite", () => {
  it("lets the invited person join with the email fixed, signed in on their account page, and open their apps", async () => {
    const link = await makeInvite("ida@example.com", { Notes: "member" });
    expect(new URL(link).origin).toBe(ACCOUNTS_URL);
    const pending = admin.getByRole("list", { name: "Pending invites" });
    await pending.getByText("ida@example.com").waitFor();
    await pending.getByText("Notes (Member)").waitFor();

    const page = await newDevice(browser);
    await page.goto(link);
    const email = page.getByLabel("Email");
    expect(await email.inputValue()).toBe("ida@example.com");
    expect(await email.getAttribute("readonly")).not.toBeNull();
    await page.getByLabel("Name").fill("Ida Noddack");
    await page.getByLabel("Password").fill("rhenium-at-last-25");
    await page.getByRole("button", { name: "Join" }).click();

    await page.waitForURL(`${ACCOUNTS_URL}/`);
    await page.getByRole("heading", { name: "Ida Noddack" }).waitFor();
    const apps = page.getByRole("list", { name: "Your apps" });
    await apps.getByText("Member").waitFor();
    await apps.getByRole("link", { name: "Notes" }).click();
    await page.waitForURL(`${NOTES_URL}/`);
    await page.getByText("Signed in as Ida Noddack").waitFor();

    await page.goto(HOME_URL);
    await page
      .getByRole("list", { name: "Your apps" })
      .getByText("Notes")
      .waitFor();

    await admin.goto(`${ACCOUNTS_URL}/people`);
    await admin.getByRole("heading", { name: "Pending invites" }).waitFor();
    expect(await admin.getByText("ida@example.com").count()).toBe(0);
  });

  it("can't be used again once someone has joined with it", async () => {
    const link = await makeInvite("inge@example.com", {});
    const page = await newDevice(browser);
    await page.goto(link);
    await page.getByLabel("Name").fill("Inge Lehmann");
    await page.getByLabel("Password").fill("inner-core-1936");
    await page.getByRole("button", { name: "Join" }).click();
    await page.waitForURL(`${ACCOUNTS_URL}/`);

    await cantBeUsed(link);
  });

  it("can't be used once the admin cancels it", async () => {
    const link = await makeInvite("cecilia@example.com", {
      Encyclopedia: "admin",
    });
    await admin
      .getByRole("form", { name: "Cancel the invite for cecilia@example.com" })
      .getByRole("button", { name: "Cancel invite" })
      .click();
    await admin.waitForURL(`${ACCOUNTS_URL}/people`);
    await admin.getByRole("heading", { name: "Pending invites" }).waitFor();
    expect(await admin.getByText("cecilia@example.com").count()).toBe(0);

    await cantBeUsed(link);
  });
});
