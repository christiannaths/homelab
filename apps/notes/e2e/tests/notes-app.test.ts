// The Notes app in a real Chromium, behind the stand-in front door: signing in with the homelab
// account, signing out of it, and starting offline (issue #47, ADR-PLAT-009). Notes has no
// sign-out of its own: the App switcher's Sign out ends the session, which these tests stand in
// for by dropping the session cookie. The platform's own behaviour, such as the no-access page and
// the gateway dropping forged headers, is tested in platform/e2e.
import type { Page } from "playwright";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  ADA,
  DANA,
  goOffline,
  goOnline,
  newDevice,
  onSignInPage,
  SESSION_COOKIE,
  signIn,
  signOut,
  startStack,
  waitUntilOfflineReady,
  type Stack,
} from "./stack.ts";

let stack: Stack;

beforeAll(async () => {
  stack = await startStack();
});
afterAll(async () => {
  await stack?.close();
});
// A test that ends offline leaves the front door stopped.
afterEach(async () => {
  await stack?.frontDoor.start();
});

const device = () => newDevice(stack.browser);
const notesUrl = () => stack.frontDoor.notesUrl;
const signedInAs = (page: Page, person: typeof ADA) =>
  signIn(page, stack.frontDoor, person);
const toSignIn = (page: Page) => onSignInPage(page, stack.frontDoor);

/** What Notes' API says about the signed-in person, asked from a Notes page. */
function sessionFrom(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/session");
    return {
      status: response.status,
      body: (await response.json()) as unknown,
    };
  });
}

/** Whether a sync socket opens from a Notes page. */
function syncOpens(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const scheme = location.protocol === "https:" ? "wss" : "ws";
        const socket = new WebSocket(`${scheme}://${location.host}/sync`);
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
    const page = await device();
    await page.goto(notesUrl());
    await toSignIn(page);
  });

  it("lands an owner on the protected page, and opens again without signing in", async () => {
    const page = await device();
    await signedInAs(page, ADA);
    expect(new URL(page.url()).origin).toBe(notesUrl());
    await page.getByText(`Signed in as ${ADA.name}`).waitFor();
    expect(await sessionFrom(page)).toMatchObject({
      status: 200,
      body: { person: { id: ADA.id, role: "owner" } },
    });

    await page.goto(notesUrl());
    await page.getByText(`Signed in as ${ADA.name}`).waitFor();
  });

  it("lets in a member, as their App access says", async () => {
    const page = await device();
    await signedInAs(page, DANA);
    await page.getByText(`Signed in as ${DANA.name}`).waitFor();
    expect(await sessionFrom(page)).toMatchObject({
      body: { person: { id: DANA.id, role: "member" } },
    });
  });

  it("syncs only while signed in", async () => {
    const page = await device();
    await signedInAs(page, ADA);
    expect(await syncOpens(page)).toBe(true);
    await signOut(page);
    expect(await syncOpens(page)).toBe(false);
  });
});

describe("signing out", () => {
  it("has no Sign out button of its own", async () => {
    const page = await device();
    await signedInAs(page, ADA);
    expect(await page.getByRole("button", { name: "Sign out" }).count()).toBe(
      0,
    );
  });

  it("signs out with the homelab account, so opening Notes again asks to sign in", async () => {
    const page = await device();
    await signedInAs(page, ADA);
    await signOut(page);

    await page.goto(notesUrl());
    await toSignIn(page);
  });

  it("signing out elsewhere signs out Notes, open tabs included", async () => {
    const page = await device();
    await signedInAs(page, ADA);
    // Notes waits for its service worker before leaving for sign-in, and the worker can't finish
    // installing once the session is gone.
    await waitUntilOfflineReady(page);
    await signOut(page);

    // Coming back to the open Notes tab.
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await toSignIn(page);

    const reopened = await page.context().newPage();
    await reopened.goto(notesUrl());
    await toSignIn(reopened);
  });
});

describe("offline", () => {
  it("installs as an app, with a manifest and icons", async () => {
    const page = await device();
    await signedInAs(page, ADA);
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
    const page = await device();
    await signedInAs(page, ADA);
    await waitUntilOfflineReady(page);

    await goOffline(page, stack.frontDoor);
    await page.reload();
    await page.getByText(`Signed in as ${ADA.name}`).waitFor();
    await page.getByText("Offline", { exact: true }).waitFor();

    await goOnline(page, stack.frontDoor);
    await page
      .getByText("Offline", { exact: true })
      .waitFor({ state: "detached" });
    await page.getByText(`Signed in as ${ADA.name}`).waitFor();
  });

  it("says signing in needs a connection when opened signed out with no network", async () => {
    const page = await device();
    await signedInAs(page, ADA);
    await waitUntilOfflineReady(page);
    await signOut(page);
    // Opened online once more, Notes learns of the sign-out and forgets the person.
    await page.goto(notesUrl());
    await toSignIn(page);

    await goOffline(page, stack.frontDoor);
    await page.goto(notesUrl());
    await page.getByText("Signing in needs a connection").waitFor();
  });

  it("sends a device signed out while it was offline to sign-in once it reconnects", async () => {
    const page = await device();
    await signedInAs(page, ADA);
    await waitUntilOfflineReady(page);
    await goOffline(page, stack.frontDoor);
    await page.reload();
    await page.getByText("Offline", { exact: true }).waitFor();

    // The homelab session ends meanwhile, as when the browser is signed out from elsewhere.
    await page.context().clearCookies({ name: SESSION_COOKIE });

    const signingIn = page.waitForRequest(`${notesUrl()}/api/sign-in`);
    await goOnline(page, stack.frontDoor);
    await signingIn;
    await toSignIn(page);
    expect(
      await page.evaluate(() => localStorage.getItem("notes.person")),
    ).toBe(null);
  });
});
