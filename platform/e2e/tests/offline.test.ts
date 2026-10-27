// The App switcher with no connection (issues #91 and #102): it shows the accounts site's last
// answer, in the page each app's service worker saved with the switcher in it, greys out what needs
// a connection, and catches up once back online.
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  compose,
  ENCYCLOPEDIA_URL,
  goOffline,
  goOnline,
  GRACE,
  HEDY,
  initialsInMenu,
  launchChromium,
  loadPeople,
  menuItems,
  newDevice,
  NOTES_URL,
  SESSION_COOKIE,
  signIn,
  tab,
  waitUntilOfflineReady,
} from "./stack.ts";

let browser: Browser;

beforeAll(async () => {
  browser = await launchChromium(inject("gatewayCaSpki"));
});
afterAll(async () => {
  await browser?.close();
});

/**
 * Opens the app and waits until its service worker has saved its page with the switcher in it, as
 * the gateway sent it, for opening offline.
 */
async function visit(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await tab(page).waitFor();
  await waitUntilOfflineReady(page);
  const kept = () =>
    page.evaluate(async () => {
      const saved = await caches.match("/index.html", { ignoreSearch: true });
      return (await saved?.text())?.includes("homelab-switcher") ?? false;
    });
  for (let i = 0; !(await kept()); i++) {
    if (i === 50) throw new Error(`${url} saved no page with the switcher`);
    await page.waitForTimeout(200);
  }
}

/**
 * Whether every icon in the switcher's menu has loaded, from the copies the switcher keeps itself
 * rather than from the network or a service worker.
 */
const keptIconsLoaded = (page: Page) =>
  page.evaluate(() => {
    const images = [
      ...(document
        .querySelector("homelab-switcher")
        ?.shadowRoot?.querySelectorAll("img") ?? []),
    ];
    return (
      images.length > 0 &&
      images.every(
        (image) =>
          image.src.startsWith("data:image/png") &&
          image.complete &&
          image.naturalWidth > 0,
      )
    );
  });

/** Which apps' icons the switcher keeps on this app's device, by hostname. */
const keptIcons = (page: Page) =>
  page.evaluate(() => {
    const kept: unknown = JSON.parse(
      localStorage.getItem("homelab.switcher.icons") ?? "{}",
    );
    return typeof kept === "object" && kept !== null
      ? Object.keys(kept)
          .map((address) => new URL(address).hostname)
          .toSorted()
      : [];
  });

const menuItem = (page: Page, name: string) =>
  page
    .getByRole("menu", { name: "Apps and sign out" })
    .getByRole("menuitem", { name });

describe("the App switcher offline", () => {
  let page: Page;
  let offline = false;

  beforeAll(async () => {
    page = await newDevice(browser);
    await signIn(page, GRACE);
    // One online visit to each app.
    await visit(page, NOTES_URL);
    await visit(page, ENCYCLOPEDIA_URL);
    await goOffline(page, inject("composeEnv"));
    offline = true;
  });
  afterAll(async () => {
    if (offline) await goOnline(page, inject("composeEnv"));
    await page.context().close();
  });

  for (const app of [
    { name: "Notes", url: NOTES_URL },
    { name: "Encyclopedia", url: ENCYCLOPEDIA_URL },
  ])
    it(`shows the tab and the last list of apps in ${app.name}`, async () => {
      await page.goto(app.url);
      await tab(page).waitFor();
      expect(await initialsInMenu(page)).toBe("GH");
      expect(await menuItems(page)).toEqual(
        ["Encyclopedia", "Notes", "Vault"]
          .map((name) => (name === app.name ? `${name}Current` : name))
          .concat(
            "Account settingsNeeds a connection",
            "Sign outNeeds a connection",
          ),
      );
      await expect.poll(() => keptIconsLoaded(page)).toBe(true);
    });

  it("greys out an app that doesn't open offline, which can't be opened", async () => {
    await page.goto(NOTES_URL);
    await menuItems(page);
    const vault = menuItem(page, "Vault");
    expect(await vault.getAttribute("aria-disabled")).toBe("true");
    expect(await vault.getAttribute("href")).toBe(null);
    // Forced, as a person could still click it; Playwright otherwise waits for it to be enabled.
    await vault.click({ force: true });
    expect(page.url()).toBe(`${NOTES_URL}/`);
    expect(
      await menuItem(page, "Encyclopedia").getAttribute("aria-disabled"),
    ).toBe(null);
  });

  it("greys out Sign out, which needs a connection", async () => {
    await page.goto(NOTES_URL);
    await menuItems(page);
    const signOut = menuItem(page, "Sign out");
    expect(await signOut.getAttribute("aria-disabled")).toBe("true");
    expect(await signOut.getAttribute("href")).toBe(null);
  });

  it("stops greying out once the device is back online", async () => {
    await page.goto(NOTES_URL);
    await menuItems(page);
    await goOnline(page, inject("composeEnv"));
    offline = false;
    await expect
      .poll(() => menuItem(page, "Vault").getAttribute("aria-disabled"))
      .toBe(null);
    expect(await menuItems(page)).toContain("Sign out");
  });
});

describe("the App switcher catching up", () => {
  it("shows apps granted or removed on the next online load or coming back online", async () => {
    const composeEnv = inject("composeEnv");
    const page = await newDevice(browser);
    try {
      await signIn(page, HEDY);
      expect(await menuItems(page)).toEqual([
        "Notes",
        "Account settings",
        "Sign out",
      ]);

      await loadPeople(composeEnv, [
        { ...HEDY, apps: { ...HEDY.apps, encyclopedia: "member" } },
      ]);
      await page.reload();
      await tab(page).waitFor();
      expect(await menuItems(page)).toEqual([
        "Encyclopedia",
        "Notes",
        "Account settings",
        "Sign out",
      ]);

      await page.context().setOffline(true);
      await loadPeople(composeEnv, [
        { ...HEDY, apps: { encyclopedia: "member" } },
      ]);
      await page.context().setOffline(false);
      await expect
        .poll(() => menuItems(page))
        .toEqual(["Encyclopedia", "Account settings", "Sign out"]);
    } finally {
      await page.context().close();
      await loadPeople(composeEnv, [HEDY]);
    }
  });

  it("falls back to the kept answer while the accounts site can't be reached", async () => {
    const composeEnv = inject("composeEnv");
    const page = await newDevice(browser);
    try {
      await signIn(page, GRACE);
      await visit(page, NOTES_URL);
      await compose(composeEnv, "stop", "accounts");
      try {
        await page.reload();
        await tab(page).waitFor();
        expect(await menuItems(page)).toEqual([
          "Encyclopedia",
          "NotesCurrent",
          "Vault",
          "Account settings",
          "Sign out",
        ]);
        await expect.poll(() => keptIconsLoaded(page)).toBe(true);
      } finally {
        await compose(composeEnv, "up", "--detach", "--wait", "accounts");
      }
    } finally {
      await page.context().close();
    }
  });
});

describe("the icons the App switcher keeps", () => {
  it("follow apps granted or removed, and go when the person signs out", async () => {
    const composeEnv = inject("composeEnv");
    const page = await newDevice(browser);
    const icon = (app: string) => `${app}.home.test`;
    try {
      await signIn(page, HEDY);
      await expect.poll(() => keptIcons(page)).toEqual([icon("notes")]);

      await loadPeople(composeEnv, [
        { ...HEDY, apps: { encyclopedia: "member" } },
      ]);
      await page.reload();
      await expect.poll(() => keptIcons(page)).toEqual([icon("encyclopedia")]);

      await page.context().clearCookies({ name: SESSION_COOKIE });
      // A new switcher asks the accounts site again, as one does on every page load.
      await page.evaluate(() =>
        document.documentElement.append(
          document.createElement("homelab-switcher"),
        ),
      );
      await expect.poll(() => keptIcons(page)).toEqual([]);
    } finally {
      await page.context().close();
      await loadPeople(composeEnv, [HEDY]);
    }
  });
});
