// The Notes app in a real Chromium, against the real VoidAuth image: signing in with the homelab
// account, signing out, and starting offline (issue #47).
import type { NotesServer } from "@homelab/notes-server";
import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Browser as VoidAuthClient } from "./browser.ts";
import {
  confirmSignOut,
  launchChromium,
  newDevice,
  onVoidAuthSignIn,
  signIn,
  startNotes,
  typePassword,
  waitUntilOfflineReady,
} from "./chromium.ts";
import {
  ADMIN_NAME,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  NOTES_URL,
  VOIDAUTH_URL,
} from "./voidauth.ts";

let notes: NotesServer;
let browser: Browser;

beforeAll(async () => {
  notes = await startNotes();
  browser = await launchChromium();
});
afterAll(async () => {
  await browser?.close();
  await notes?.close();
});

describe("signing in with the homelab account", () => {
  it("goes straight to the homelab sign-in page when signed out", async () => {
    const page = await newDevice(browser);
    await page.goto(NOTES_URL);
    await onVoidAuthSignIn(page);
  });

  it("lands the first homelab admin on the protected page, and opens again without a password", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADMIN_USERNAME, ADMIN_PASSWORD);
    expect(new URL(page.url()).origin).toBe(NOTES_URL);
    await page.getByText(`Signed in as ${ADMIN_NAME}`).waitFor();

    await page.goto(NOTES_URL);
    await page.getByText("Signed in as").waitFor();
  });

  it("signs in to Notes with no password while signed in to the homelab", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADMIN_USERNAME, ADMIN_PASSWORD);
    // Notes has no session on this device now, but the homelab account is still signed in.
    await page.context().clearCookies({ name: "notes_session" });
    await page.goto(NOTES_URL);
    await page.getByText(`Signed in as ${ADMIN_NAME}`).waitFor();
  });
});

describe("signing out", () => {
  it("signs out of the homelab account, so opening Notes again asks for the password", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADMIN_USERNAME, ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign out" }).click();
    await confirmSignOut(page);
    await onVoidAuthSignIn(page);

    await page.goto(NOTES_URL);
    await onVoidAuthSignIn(page);
  });

  it("leaves the person's other browsers signed in", async () => {
    const page = await newDevice(browser);
    const other = await newDevice(browser);
    await signIn(page, ADMIN_USERNAME, ADMIN_PASSWORD);
    await signIn(other, ADMIN_USERNAME, ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign out" }).click();
    await confirmSignOut(page);
    await onVoidAuthSignIn(page);

    await other.reload();
    await other.getByText(`Signed in as ${ADMIN_NAME}`).waitFor();
  });
});

describe("signing out of the homelab elsewhere", () => {
  it("signs Notes out when the person signs out on VoidAuth's own page", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADMIN_USERNAME, ADMIN_PASSWORD);
    await page.goto(VOIDAUTH_URL);
    // The menu button is a Material icon whose ligature text is its only label.
    await page.getByText("menu", { exact: true }).click();
    await page.getByRole("link", { name: "Logout" }).click();
    await confirmSignOut(page);
    // VoidAuth then sends the browser to its default page, which is Notes in this suite.
    await onVoidAuthSignIn(page);

    await page.goto(NOTES_URL);
    await onVoidAuthSignIn(page);
  });
});

describe("offline", () => {
  it("installs as an app, with a manifest and icons", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADMIN_USERNAME, ADMIN_PASSWORD);
    const href = await page
      .locator('link[rel="manifest"]')
      .getAttribute("href");
    const manifest: unknown = await (
      await fetch(new URL(href ?? "", NOTES_URL))
    ).json();
    expect(manifest).toMatchObject({
      name: "Notes",
      display: "standalone",
      start_url: "/",
      icons: [
        { sizes: "192x192" },
        { sizes: "512x512" },
        { sizes: "512x512", purpose: "maskable" },
      ],
    });
  });

  it("opens signed in with no network, says it is offline, and clears that on reconnecting", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADMIN_USERNAME, ADMIN_PASSWORD);
    await waitUntilOfflineReady(page);

    await page.context().setOffline(true);
    await page.reload();
    await page.getByText(`Signed in as ${ADMIN_NAME}`).waitFor();
    await page.getByText("Offline", { exact: true }).waitFor();

    await page.context().setOffline(false);
    await page
      .getByText("Offline", { exact: true })
      .waitFor({ state: "detached" });
    await page.getByText(`Signed in as ${ADMIN_NAME}`).waitFor();
  });

  it("says signing in needs a connection on a device that has never signed in", async () => {
    const page = await newDevice(browser);
    await page.goto(NOTES_URL);
    await onVoidAuthSignIn(page);

    await page.context().setOffline(true);
    await page.goto(NOTES_URL);
    await page.getByText("Signing in needs a connection").waitFor();
  });

  it("sends a device whose session ended while it was offline to sign-in once it reconnects", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADMIN_USERNAME, ADMIN_PASSWORD);
    await waitUntilOfflineReady(page);
    await page.context().setOffline(true);
    await page.reload();
    await page.getByText("Offline", { exact: true }).waitFor();

    // The session ends on the server meanwhile, as when the device is signed out from elsewhere.
    const session = (await page.context().cookies(NOTES_URL)).find(
      (cookie) => cookie.name === "notes_session",
    );
    await fetch(`${NOTES_URL}/api/sign-out`, {
      method: "POST",
      headers: { cookie: `notes_session=${session?.value}` },
    });

    const signingIn = page.waitForRequest(`${NOTES_URL}/api/sign-in`);
    await page.context().setOffline(false);
    await signingIn;
  });
});

describe("signing out offline", () => {
  const SIGNED_OUT_HERE =
    "Signed out here. Other apps finish signing out next time Notes is online.";

  it("signs out on the device at once, and finishes on the next online start", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADMIN_USERNAME, ADMIN_PASSWORD);
    await waitUntilOfflineReady(page);
    await page.context().setOffline(true);
    await page.reload();
    await page.getByText("Offline", { exact: true }).waitFor();

    await page.getByRole("button", { name: "Sign out" }).click();
    await page.getByText(SIGNED_OUT_HERE).waitFor();
    await page.reload();
    await page.getByText(SIGNED_OUT_HERE).waitFor();
    expect(await page.getByText("Signed in as").count()).toBe(0);

    await page.context().setOffline(false);
    const sessionChecks: string[] = [];
    page.on("request", (request) => {
      if (request.url() === `${NOTES_URL}/api/session`)
        sessionChecks.push(request.url());
    });
    await page.reload();
    await page.waitForURL((url) => url.pathname.startsWith("/logout"));
    // The sign-out ran first: Notes never asked who was signed in.
    expect(sessionChecks).toEqual([]);
    await confirmSignOut(page);
    await onVoidAuthSignIn(page);

    await page.goto(NOTES_URL);
    await onVoidAuthSignIn(page);
  });
});

describe("someone the homelab hasn't given Notes", () => {
  /** A homelab account made from an admin's invite link, which Notes does not admit. */
  async function invitedAccount() {
    const admin = new VoidAuthClient();
    await admin.signInToVoidAuth(ADMIN_USERNAME, ADMIN_PASSWORD);
    const username = `guest_${process.pid}_${Date.now()}`;
    const account = { username, password: `amber-${username}-lighthouse-93` };
    const response = await new VoidAuthClient().acceptInvite(
      await admin.createInvite(),
      account,
    );
    expect(response.ok).toBe(true);
    return account;
  }

  it("sees the no-access screen, which stays on reload, and can use a different account", async () => {
    const { username, password } = await invitedAccount();
    const page = await newDevice(browser);
    await page.goto(NOTES_URL);
    await onVoidAuthSignIn(page);
    await typePassword(page, username, password);
    await page
      .getByText("You don't have access to Notes. Ask your homelab admin.")
      .waitFor();

    const signInsStarted: string[] = [];
    page.on("request", (request) => {
      if (request.url().startsWith(`${NOTES_URL}/api/sign-in`))
        signInsStarted.push(request.url());
    });
    await page.reload();
    await page
      .getByRole("button", { name: "Use a different account" })
      .waitFor();
    expect(new URL(page.url()).pathname).toBe("/no-access");
    expect(signInsStarted).toEqual([]);

    await page.getByRole("button", { name: "Use a different account" }).click();
    await confirmSignOut(page);
    await onVoidAuthSignIn(page);
    await typePassword(page, ADMIN_USERNAME, ADMIN_PASSWORD);
    await page.getByText(`Signed in as ${ADMIN_NAME}`).waitFor();
  });
});
