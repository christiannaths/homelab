// The App switcher, as Home's own page uses it, in a real Chromium behind the gateway and VoidAuth
// (issue #88): the user icon, the menu, signing out of every app, the keyboard, and where and how
// it renders.
import type { HomeServer } from "@homelab/home-server";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  ACCOUNTS_URL,
  ADA,
  ADMIN,
  confirmSignOut,
  DANA,
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
  VOIDAUTH_SESSION_COOKIE,
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

const background = (page: Page) =>
  userIcon(page).evaluate((icon) => getComputedStyle(icon).backgroundColor);

const panelStyle = (page: Page) =>
  page.getByRole("menu").evaluate((menu) => {
    const panel = menu.parentElement ?? menu;
    const style = getComputedStyle(panel);
    return {
      background: style.backgroundColor,
      color: style.color,
      font: style.fontFamily,
    };
  });

describe("the user icon", () => {
  it("shows the person's initials, in a colour that depends only on the username", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    expect(await userIcon(page).textContent()).toBe("AL");
    const other = await newDevice(browser);
    await signIn(other, ADA);
    expect(await background(other)).toBe(await background(page));

    const dana = await newDevice(browser);
    await signIn(dana, DANA);
    expect(await userIcon(dana).textContent()).toBe("DS");
    expect(await background(dana)).not.toBe(await background(page));
  });
});

describe("the menu", () => {
  it("lists the person, Home, their other apps by name, and Sign out", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    await userIcon(page).click();
    await page.getByText(ADA.name ?? "", { exact: true }).waitFor();
    await page.getByText(ADA.email ?? "", { exact: true }).waitFor();
    expect(await menuItems(page)).toEqual([
      "HomeCurrent",
      "Encyclopedia",
      "Notes",
      "Account settings",
      "Sign out",
    ]);
    expect(
      await page
        .getByRole("menuitem", { name: /^Home/ })
        .getAttribute("aria-current"),
    ).toBe("page");
  });

  it("leaves out apps the person has no access to", async () => {
    const page = await newDevice(browser);
    await signIn(page, DANA);
    expect(await menuItems(page)).toEqual([
      "HomeCurrent",
      "Notes",
      "Account settings",
      "Sign out",
    ]);

    const admin = await newDevice(browser);
    await signIn(admin, ADMIN);
    expect(await menuItems(admin)).toEqual([
      "HomeCurrent",
      "Encyclopedia",
      "Account settings",
      "Sign out",
    ]);
  });

  it("opens an app in one click", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    await userIcon(page).click();
    await page.getByRole("menuitem", { name: "Encyclopedia" }).click();
    await page.waitForURL(`${ENCYCLOPEDIA_URL}/`);
  });

  it("opens the person's account settings on VoidAuth", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    await userIcon(page).click();
    await page.getByRole("menuitem", { name: "Account settings" }).click();
    // VoidAuth's own page for the signed-in account, not its sign-in page.
    await page.waitForURL(`${ACCOUNTS_URL}/`);
    await page.waitForLoadState("networkidle");
    expect(new URL(page.url()).pathname).toBe("/");
  });

  it("signs the homelab account out of every app", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    await userIcon(page).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await confirmSignOut(page);
    await onVoidAuthSignIn(page);

    for (const app of [HOME_URL, NOTES_URL, ENCYCLOPEDIA_URL]) {
      const tab = await page.context().newPage();
      await tab.goto(app);
      await onVoidAuthSignIn(tab);
    }
  });

  it("closes on Escape and on a click outside it", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    const menu = page.getByRole("menu");
    await userIcon(page).click();
    await menu.waitFor();
    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "hidden" });

    await userIcon(page).click();
    await menu.waitFor();
    await page.getByRole("heading", { name: "Home" }).click();
    await menu.waitFor({ state: "hidden" });
  });

  it("works with the keyboard alone", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    const focused = () =>
      page.evaluate(() => {
        const host = document.querySelector("homelab-switcher");
        const inner = host?.shadowRoot?.activeElement;
        return inner?.textContent?.trim() ?? document.activeElement?.tagName;
      });
    await userIcon(page).focus();
    await page.keyboard.press("Enter");
    expect(await focused()).toBe("HomeCurrent");
    await page.keyboard.press("ArrowDown");
    expect(await focused()).toBe("Encyclopedia");
    await page.keyboard.press("End");
    expect(await focused()).toBe("Sign out");
    await page.keyboard.press("ArrowDown");
    expect(await focused()).toBe("HomeCurrent");
    await page.keyboard.press("Escape");
    await page.getByRole("menu").waitFor({ state: "hidden" });
    expect(await focused()).toBe("AL");

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForURL(`${ENCYCLOPEDIA_URL}/`);
  });
});

describe("where and how it renders", () => {
  it("sits in the element Home marks in its header, in Home's light or dark theme", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    expect(
      await page.evaluate(
        () =>
          document.querySelector("homelab-switcher")?.closest("header") !==
          null,
      ),
    ).toBe(true);
    await userIcon(page).click();
    expect((await panelStyle(page)).background).toBe("rgb(255, 255, 255)");

    await page.emulateMedia({ colorScheme: "dark" });
    await expect
      .poll(async () => (await panelStyle(page)).background)
      .toBe("rgb(31, 31, 31)");
  });

  it("floats in a named corner, in the theme the script tag asks for, untouched by the page's styles", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    const colour = await background(page);
    // A fresh page on Home's origin, where no switcher has run yet.
    await page.goto(`${HOME_URL}/manifest.webmanifest`);
    await page.setContent(`
      <style>
        * { color: red !important; font-family: serif !important; }
        button { background: lime !important; }
        div { background: yellow !important; }
      </style>
      <p>A page with loud styles.</p>
      <script src="/_homelab/switcher.js" data-placement="bottom-left" data-theme="dark"></script>
    `);
    await userIcon(page).waitFor();
    const box = await userIcon(page).boundingBox();
    const viewport = page.viewportSize();
    expect(box && viewport && box.x < 40 && box.y > viewport.height - 60).toBe(
      true,
    );
    expect(await background(page)).toBe(colour);

    await userIcon(page).click();
    const style = await panelStyle(page);
    expect(style.background).toBe("rgb(31, 31, 31)");
    expect(style.color).toBe("rgb(201, 201, 201)");
    expect(style.font).toMatch(/^-apple-system/);
  });

  it("floats top-right when the page marks no element and names no corner", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    await page.goto(`${HOME_URL}/manifest.webmanifest`);
    await page.setContent(`<script src="/_homelab/switcher.js"></script>`);
    await userIcon(page).waitFor();
    const box = await userIcon(page).boundingBox();
    const viewport = page.viewportSize();
    expect(box && viewport && box.x > viewport.width - 60 && box.y < 40).toBe(
      true,
    );
  });
});

describe("signed out", () => {
  it("shows nothing when the script is loaded signed out", async () => {
    const page = await newDevice(browser);
    await page.goto(`${HOME_URL}/manifest.webmanifest`);
    await page.setContent(`
      <homelab-switcher></homelab-switcher>
      <script src="/_homelab/switcher.js" data-placement="element"></script>
    `);
    await page.waitForLoadState("load");
    expect(await userIcon(page).count()).toBe(0);
  });

  it("hides once Home says the person is signed out", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    await userIcon(page).waitFor();
    await page.context().clearCookies({ name: VOIDAUTH_SESSION_COOKIE });
    // A new switcher asks Home again, as one does on every page load.
    await page.evaluate(() =>
      document.body.append(document.createElement("homelab-switcher")),
    );
    await userIcon(page).first().waitFor({ state: "hidden" });
    expect(await userIcon(page).count()).toBe(0);
  });
});
