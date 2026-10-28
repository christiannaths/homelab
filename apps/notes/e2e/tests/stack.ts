// Notes behind the stand-in front door (front-door.ts) and the people the tests sign in as. A
// browser reaches Notes through the front door only, as it reaches an app through the gateway.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Identity } from "@homelab/identity";
import { startServer, type NotesServer } from "@homelab/notes-server";
import { chromium, type Browser, type Page } from "playwright";
import {
  SESSION_COOKIE,
  startFrontDoor,
  type FrontDoor,
} from "./front-door.ts";

export { SESSION_COOKIE };

/** The client's production build: the service worker exists only there. */
const CLIENT_DIR = fileURLToPath(new URL("../../web/dist", import.meta.url));

/** A test person, as the platform would describe them to Notes. */
export interface Person extends Identity {
  name: string;
}

export const ADA: Person = {
  id: "account-ada",
  name: "Ada Lovelace",
  email: "ada@example.com",
  access: { notes: "admin" },
};
export const DANA: Person = {
  id: "account-dana",
  name: "Dana Scully",
  email: "dana@example.com",
  access: { notes: "member" },
};
const PEOPLE = [ADA, DANA];

export interface Stack {
  notes: NotesServer;
  frontDoor: FrontDoor;
  browser: Browser;
  close(): Promise<void>;
}

/** Starts Notes with empty data, the front door in front of it, and Chromium. */
export async function startStack(): Promise<Stack> {
  const notes = await startServer({
    dataDir: mkdtempSync(path.join(tmpdir(), "notes-e2e-")),
    port: 0,
    clientDir: CLIENT_DIR,
  });
  const frontDoor = await startFrontDoor({
    notesPort: notes.port,
    people: PEOPLE,
  });
  const browser = await chromium.launch({
    // Points at an already-installed Chromium where Playwright's own download is not available.
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    args: [
      // Chromium resolves *.localhost to this machine itself, so no DNS or hosts file is needed.
      "--no-proxy-server",
    ],
  });
  return {
    notes,
    frontDoor,
    browser,
    async close() {
      await browser.close();
      await frontDoor.stop();
      await notes.close();
    },
  };
}

/** One browser profile: its own cookies, storage and service worker, like a separate device. */
export async function newDevice(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

/** Resolves once the page has arrived on the stand-in sign-in page. */
export function onSignInPage(page: Page, frontDoor: FrontDoor): Promise<void> {
  return page.waitForURL(
    (url) => url.origin === frontDoor.signInUrl && url.pathname === "/sign-in",
  );
}

/** Opens Notes and signs in on the sign-in page; resolves once the sidebar shows. */
export async function signIn(
  page: Page,
  frontDoor: FrontDoor,
  person: Person,
): Promise<void> {
  await page.goto(frontDoor.notesUrl);
  await onSignInPage(page, frontDoor);
  await page.getByRole("button", { name: `Sign in as ${person.name}` }).click();
  await sidebar(page).waitFor();
}

export const sidebar = (page: Page) =>
  page.getByRole("navigation", { name: "Sidebar" });

/** The sidebar's Private section, with a link to each of the person's pages there. */
export const privateSection = (page: Page) =>
  sidebar(page).getByRole("region", { name: "Private" });

/** The open page's title field. */
export const pageTitle = (page: Page) =>
  page.getByRole("textbox", { name: "Title" });

/** The open page's body, in BlockNote. */
export const pageBody = (page: Page) => page.locator(".bn-editor");

/** What Notes shows while the device has no connection. */
export const OFFLINE_STATUS = "Offline · saved locally";

/** The workspace a person is given the first time they open Notes. */
export const defaultWorkspaceOf = (person: Person) =>
  `${person.name}'s workspace`;

/** Ends the device's session, as signing out in any app or on the accounts site does. */
export async function signOut(page: Page): Promise<void> {
  await page.context().clearCookies({ name: SESSION_COOKIE });
}

/** Waits until the service worker controls the page, so the app can start offline. */
export async function waitUntilOfflineReady(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
}

/**
 * Takes the device off the network: the browser says it is offline, and the front door stops,
 * since Playwright's offline mode still lets service workers through to the network.
 */
export async function goOffline(page: Page, frontDoor: FrontDoor) {
  await page.context().setOffline(true);
  await frontDoor.stop();
}

/** Puts the device back on the network. */
export async function goOnline(page: Page, frontDoor: FrontDoor) {
  await frontDoor.start();
  await page.context().setOffline(false);
}
