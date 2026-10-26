// Managing people on the People page (issue #116): a homelab admin changes someone's App access,
// makes them a homelab admin or not, signs them out everywhere and removes their account, and each
// change reaches the person on their next request.
import type { HomeServer } from "@homelab/home-server";
import type { Browser, Locator, Page } from "playwright";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  inject,
  it,
} from "vitest";
import {
  ACCOUNTS_URL,
  ADMIN,
  ENCYCLOPEDIA_URL,
  HOME_URL,
  KATHERINE,
  launchChromium,
  loadPeople,
  MARGARET,
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
let admin: Page;

beforeAll(async () => {
  home = await startHome();
  browser = await launchChromium(inject("gatewayCaSpki"));
  admin = await newDevice(browser);
  await signIn(admin, ADMIN);
});
afterAll(async () => {
  await browser?.close();
  await home?.close();
});
// Katherine is changed by each test here, so each starts from her account as loaded.
afterEach(async () => {
  await loadPeople(inject("composeEnv"), [KATHERINE]);
});

/** The person's entry in the People page's list, with the page opened afresh. */
async function entryOf(email: string): Promise<Locator> {
  await admin.goto(`${ACCOUNTS_URL}/people`);
  return admin
    .getByRole("list", { name: "People" })
    .getByRole("listitem")
    .filter({ has: admin.getByText(email, { exact: true }) });
}

/** Sends one of the person's forms on the People page, and waits for the page to come back. */
async function press(form: Locator, button: string): Promise<void> {
  await form.getByRole("button", { name: button }).click();
  await admin.waitForURL(`${ACCOUNTS_URL}/people`);
  await admin.getByRole("heading", { name: "People" }).waitFor();
}

describe("the People page", () => {
  it("lists everyone with their apps, each with its name, icon and level", async () => {
    const katherine = await entryOf(KATHERINE.email);
    await katherine.getByRole("heading", { name: KATHERINE.name }).waitFor();
    const apps = katherine.getByRole("list", {
      name: `Apps of ${KATHERINE.email}`,
    });
    await apps.getByText("Notes").waitFor();
    await apps.getByText("Member").waitFor();
    await expect
      .poll(() =>
        apps
          .locator("img")
          .evaluateAll((images) =>
            images.every(
              (image) =>
                image instanceof HTMLImageElement && image.naturalWidth > 0,
            ),
          ),
      )
      .toBe(true);
  });
});

describe("App access on the People page", () => {
  it("gives someone an app and takes one away, on their next request", async () => {
    const page = await newDevice(browser);
    await signIn(page, KATHERINE);

    const form = (await entryOf(KATHERINE.email)).getByRole("form", {
      name: `App access for ${KATHERINE.email}`,
    });
    await form
      .getByLabel("Encyclopedia", { exact: true })
      .selectOption("admin");
    await form.getByLabel("Notes", { exact: true }).selectOption("");
    await press(form, "Save apps");
    const apps = (await entryOf(KATHERINE.email)).getByRole("list", {
      name: `Apps of ${KATHERINE.email}`,
    });
    await apps.getByText("Encyclopedia").waitFor();
    await apps.getByText("Admin").waitFor();
    expect(await apps.getByText("Notes").count()).toBe(0);

    await page.goto(ENCYCLOPEDIA_URL);
    await tab(page).waitFor();
    expect(new URL(page.url()).origin).toBe(ENCYCLOPEDIA_URL);
    const notes = await page.goto(`${NOTES_URL}/`);
    expect(notes?.status()).toBe(403);
    await page
      .getByRole("heading", { name: "You don't have access to Notes" })
      .waitFor();
  });
});

describe("the homelab admin switch", () => {
  it("lets someone open the People page, and stops them, on their next request", async () => {
    const page = await newDevice(browser);
    await signIn(page, KATHERINE);
    const adminSwitch = async () =>
      (await entryOf(KATHERINE.email)).getByRole("form", {
        name: `Homelab admin for ${KATHERINE.email}`,
      });

    await press(await adminSwitch(), "Make homelab admin");
    await page.goto(`${ACCOUNTS_URL}/people`);
    await page.getByRole("heading", { name: "People" }).waitFor();

    await press(await adminSwitch(), "Stop being a homelab admin");
    const refused = await page.goto(`${ACCOUNTS_URL}/people`);
    expect(refused?.status()).toBe(403);
    await page
      .getByRole("heading", { name: "Only homelab admins can open this page" })
      .waitFor();
  });
});

describe("signing someone out everywhere", () => {
  it("sends each of their devices to sign in on its next request, and leaves the admin signed in", async () => {
    const phone = await newDevice(browser);
    const laptop = await newDevice(browser);
    await signIn(phone, KATHERINE);
    await signIn(laptop, KATHERINE);

    const entry = await entryOf(KATHERINE.email);
    await press(
      entry.getByRole("form", {
        name: `Sign out ${KATHERINE.email} everywhere`,
      }),
      "Sign out everywhere",
    );

    for (const device of [phone, laptop]) {
      await device.goto(HOME_URL);
      await onSignInPage(device);
    }
    await admin.goto(HOME_URL);
    await admin.getByRole("list", { name: "Your apps" }).waitFor();
  });
});

describe("removing an account", () => {
  it("signs the person out everywhere, and they can no longer sign in", async () => {
    const page = await newDevice(browser);
    await signIn(page, MARGARET);

    const entry = await entryOf(MARGARET.email);
    await press(
      entry.getByRole("form", { name: `Remove ${MARGARET.email}` }),
      "Remove account",
    );
    expect(await admin.getByText(MARGARET.email).count()).toBe(0);

    await page.goto(`${NOTES_URL}/`);
    await onSignInPage(page);
    await typePassword(page, MARGARET);
    await page
      .getByRole("alert")
      .getByText("Wrong email or password.")
      .waitFor();
  });
});
