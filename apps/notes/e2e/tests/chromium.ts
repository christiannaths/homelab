// A real Chromium opening the Notes app that the Notes server serves, and walking VoidAuth's own
// sign-in page as a person would.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer, type NotesServer } from "@homelab/notes-server";
import { chromium, type Browser, type Page } from "playwright";
import {
  NOTES_CLIENT_SECRET,
  NOTES_PORT,
  NOTES_URL,
  VOIDAUTH_URL,
} from "./voidauth.ts";

/** The client's production build: the service worker exists only there. */
const CLIENT_DIR = fileURLToPath(new URL("../../web/dist", import.meta.url));

export function startNotes(): Promise<NotesServer> {
  return startServer({
    dataDir: mkdtempSync(path.join(tmpdir(), "notes-e2e-")),
    port: NOTES_PORT,
    publicUrl: NOTES_URL,
    clientDir: CLIENT_DIR,
    oidc: {
      issuer: `${VOIDAUTH_URL}/oidc`,
      clientId: "notes",
      clientSecret: NOTES_CLIENT_SECRET,
    },
  });
}

export function launchChromium(): Promise<Browser> {
  // Points at an already-installed Chromium where Playwright's own download is not available.
  return chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  });
}

/** One browser profile: its own cookies, storage and service worker, like a separate device. */
export async function newDevice(browser: Browser): Promise<Page> {
  // VoidAuth's pages allow form posts to lead only to itself or to https: addresses. The suite
  // runs Notes on http://localhost, so VoidAuth's sign-out confirmation could not return to it.
  const context = await browser.newContext({ bypassCSP: true });
  return context.newPage();
}

/** Resolves once the page has arrived on VoidAuth's sign-in page. */
export function onVoidAuthSignIn(page: Page): Promise<void> {
  return page.waitForURL(
    (url) => url.origin === VOIDAUTH_URL && url.pathname === "/login",
  );
}

/** Types a password on VoidAuth's sign-in page, which the page must already be on. */
export async function typePassword(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  await page.getByLabel("Username or Email").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  // VoidAuth offers to set up a passkey after a password sign-in; a person would skip it.
  const skip = page.getByRole("button", { name: "Skip", exact: true });
  const offered = await Promise.race([
    skip.waitFor().then(() => true),
    page.waitForURL((url) => url.origin !== VOIDAUTH_URL).then(() => false),
  ]).catch(() => false);
  if (offered) await skip.click();
}

/** Opens Notes and signs in on VoidAuth's page; resolves once the protected page shows. */
export async function signIn(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  await page.goto(NOTES_URL);
  await onVoidAuthSignIn(page);
  await typePassword(page, username, password);
  await page.getByText("Signed in as").waitFor();
}

/** Waits until the service worker controls the page, so the app can start offline. */
export async function waitUntilOfflineReady(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
}

/** Answers Yes on VoidAuth's "sign out?" page, which the browser must be on or on its way to. */
export async function confirmSignOut(page: Page): Promise<void> {
  await page.waitForURL(
    (url) => url.origin === VOIDAUTH_URL && url.pathname.startsWith("/logout"),
  );
  await page.getByRole("button", { name: "Yes", exact: true }).click();
}
