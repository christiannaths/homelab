// The Notes app in a real Chromium, behind the homelab gateway and the accounts service: signing in
// with the homelab account, signing out of it, and starting offline (issue #47, ADR-PLAT-004).
// Notes has no sign-out of its own: the App switcher's Sign out, which these tests stand in for
// with the same request to the accounts site, is tested in Home's suite.
import { identityHeaders } from "@homelab/identity";
import type { NotesServer } from "@homelab/notes-server";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  ADA,
  ACCOUNTS_URL,
  BOB,
  DANA,
  EVE,
  launchChromium,
  newDevice,
  NOTES_URL,
  onSignInPage,
  SESSION_COOKIE,
  signIn,
  startNotes,
  typePassword,
  waitUntilOfflineReady,
} from "./stack.ts";

let notes: NotesServer;
let browser: Browser;

beforeAll(async () => {
  notes = await startNotes();
  browser = await launchChromium(inject("gatewayCaSpki"));
});
afterAll(async () => {
  await browser?.close();
  await notes?.close();
});

/** What Notes' API says about the signed-in person, asked from a Notes page. */
function sessionFrom(page: Page, headers: Record<string, string> = {}) {
  return page.evaluate(async (sent) => {
    const response = await fetch("/api/session", { headers: sent });
    return {
      status: response.status,
      body: (await response.json()) as unknown,
    };
  }, headers);
}

/**
 * Signs the homelab account out with the POST the App switcher's Sign out sends, from a page of
 * the accounts site, and shows the sign-in page, as the switcher does next.
 */
async function signOut(page: Page): Promise<void> {
  await page.goto(ACCOUNTS_URL);
  const status = await page.evaluate(
    async () =>
      (await fetch("/sign-out", { method: "POST", credentials: "include" }))
        .status,
  );
  expect(status).toBe(204);
  await page.goto(`${ACCOUNTS_URL}/sign-in`);
  await onSignInPage(page);
}

const idOf = (account: { email: string }) =>
  inject("accountIds")[account.email];

/** Whether a sync socket opens from a Notes page. */
function syncOpens(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const socket = new WebSocket(`wss://${location.host}/sync`);
        socket.addEventListener("open", () => {
          socket.close();
          resolve(true);
        });
        socket.addEventListener("error", () => resolve(false));
      }),
  );
}

describe("signing in with the homelab account", () => {
  it("goes straight to the homelab sign-in page when signed out", async () => {
    const page = await newDevice(browser);
    await page.goto(NOTES_URL);
    await onSignInPage(page);
  });

  it("lands an owner on the protected page, and opens again without a password", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    expect(new URL(page.url()).origin).toBe(NOTES_URL);
    await page.getByText(`Signed in as ${ADA.name}`).waitFor();
    expect(await sessionFrom(page)).toMatchObject({
      status: 200,
      body: { person: { id: idOf(ADA), role: "owner" } },
    });

    await page.goto(NOTES_URL);
    await page.getByText(`Signed in as ${ADA.name}`).waitFor();
  });

  it("lets in a member, as their App access says", async () => {
    const page = await newDevice(browser);
    await signIn(page, DANA);
    await page.getByText(`Signed in as ${DANA.name}`).waitFor();
    expect(await sessionFrom(page)).toMatchObject({
      body: { person: { id: idOf(DANA), role: "member" } },
    });
  });

  it("opens with no password after signing in on the homelab's own page", async () => {
    const page = await newDevice(browser);
    await page.goto(`${ACCOUNTS_URL}/`);
    await onSignInPage(page);
    await typePassword(page, ADA);
    await page.waitForURL(`${ACCOUNTS_URL}/`);

    await page.goto(NOTES_URL);
    await page.getByText(`Signed in as ${ADA.name}`).waitFor();
  });

  it("turns away someone the homelab admin didn't give Notes, before Notes sees them", async () => {
    const page = await newDevice(browser);
    await page.goto(NOTES_URL);
    await onSignInPage(page);
    await typePassword(page, BOB);
    await page.waitForURL(`${NOTES_URL}/`);
    await page
      .getByRole("heading", { name: "You don't have access to Notes" })
      .waitFor();
    expect(await page.getByText("Signed in as").count()).toBe(0);
  });

  it("can't claim someone else's name or groups by sending the gateway's headers", async () => {
    const page = await newDevice(browser);
    await signIn(page, EVE);
    expect(
      await sessionFrom(
        page,
        identityHeaders({
          id: idOf(ADA),
          name: "Ada Lovelace",
          email: null,
          access: { notes: "admin" },
        }),
      ),
    ).toEqual({
      status: 200,
      body: { person: { id: idOf(EVE), role: "member", name: EVE.name } },
    });
  });

  it("syncs through the gateway only while signed in", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    expect(await syncOpens(page)).toBe(true);
    await page.context().clearCookies({ name: SESSION_COOKIE });
    expect(await syncOpens(page)).toBe(false);
  });
});

describe("signing out", () => {
  it("has no Sign out button of its own", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    expect(await page.getByRole("button", { name: "Sign out" }).count()).toBe(
      0,
    );
  });

  it("signs out with the homelab account, so opening Notes again asks for the password", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    await signOut(page);

    await page.goto(NOTES_URL);
    await onSignInPage(page);
  });

  it("leaves the person's other browsers signed in", async () => {
    const page = await newDevice(browser);
    const other = await newDevice(browser);
    await signIn(page, ADA);
    await signIn(other, ADA);
    await signOut(page);

    await other.reload();
    await other.getByText(`Signed in as ${ADA.name}`).waitFor();
  });

  it("signing out on the homelab's own page signs out Notes, open tabs included", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    // Notes waits for its service worker before leaving for sign-in, and the worker can't finish
    // installing once the session is gone.
    await waitUntilOfflineReady(page);
    const homelab = await page.context().newPage();
    await signOut(homelab);

    // Coming back to the open Notes tab.
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await onSignInPage(page);

    const reopened = await page.context().newPage();
    await reopened.goto(NOTES_URL);
    await onSignInPage(reopened);
  });
});

describe("offline", () => {
  it("installs as an app, with a manifest and icons", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    const manifest = await page.evaluate(async () => {
      const href = document
        .querySelector('link[rel="manifest"]')
        ?.getAttribute("href");
      return (await (await fetch(href ?? "")).json()) as unknown;
    });
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
    await signIn(page, ADA);
    await waitUntilOfflineReady(page);

    await page.context().setOffline(true);
    await page.reload();
    await page.getByText(`Signed in as ${ADA.name}`).waitFor();
    await page.getByText("Offline", { exact: true }).waitFor();

    await page.context().setOffline(false);
    await page
      .getByText("Offline", { exact: true })
      .waitFor({ state: "detached" });
    await page.getByText(`Signed in as ${ADA.name}`).waitFor();
  });

  it("says signing in needs a connection when opened signed out with no network", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    await waitUntilOfflineReady(page);
    await signOut(page);
    // Opened online once more, Notes learns of the sign-out and forgets the person.
    await page.goto(NOTES_URL);
    await onSignInPage(page);

    await page.context().setOffline(true);
    await page.goto(NOTES_URL);
    await page.getByText("Signing in needs a connection").waitFor();
  });

  it("sends a device signed out while it was offline to sign-in once it reconnects", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    await waitUntilOfflineReady(page);
    await page.context().setOffline(true);
    await page.reload();
    await page.getByText("Offline", { exact: true }).waitFor();

    // The homelab session ends meanwhile, as when the browser is signed out from elsewhere.
    await page.context().clearCookies({ name: SESSION_COOKIE });

    const signingIn = page.waitForRequest(`${NOTES_URL}/api/sign-in`);
    await page.context().setOffline(false);
    await signingIn;
    await onSignInPage(page);
    expect(
      await page.evaluate(() => localStorage.getItem("notes.person")),
    ).toBe(null);
  });
});
