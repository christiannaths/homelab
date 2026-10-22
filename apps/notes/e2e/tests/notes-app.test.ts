// The Notes app in a real Chromium, behind the homelab gateway and the real VoidAuth image:
// signing in with the homelab account, signing out of every app at once, and starting offline
// (issue #47, ADR-PLAT-004).
import type { NotesServer } from "@homelab/notes-server";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  ADA,
  ACCOUNTS_URL,
  BOB,
  confirmSignOut,
  DANA,
  EVE,
  launchChromium,
  newDevice,
  NOTES_URL,
  onVoidAuthSignIn,
  signIn,
  startNotes,
  typePassword,
  VOIDAUTH_SESSION_COOKIE,
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
    await onVoidAuthSignIn(page);
  });

  it("lands an owner on the protected page, and opens again without a password", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    expect(new URL(page.url()).origin).toBe(NOTES_URL);
    await page.getByText(`Signed in as ${ADA.name}`).waitFor();
    expect(await sessionFrom(page)).toMatchObject({
      status: 200,
      body: { person: { id: "ada", role: "owner" } },
    });

    await page.goto(NOTES_URL);
    await page.getByText(`Signed in as ${ADA.name}`).waitFor();
  });

  it("lets in a member, as the notes group says", async () => {
    const page = await newDevice(browser);
    await signIn(page, DANA);
    await page.getByText(`Signed in as ${DANA.name}`).waitFor();
    expect(await sessionFrom(page)).toMatchObject({
      body: { person: { id: "dana", role: "member" } },
    });
  });

  it("opens with no password after signing in on the homelab's own page", async () => {
    const page = await newDevice(browser);
    await page.goto(`${ACCOUNTS_URL}/`);
    await onVoidAuthSignIn(page);
    await typePassword(page, ADA);
    await page.waitForURL(`${ACCOUNTS_URL}/`);

    await page.goto(NOTES_URL);
    await page.getByText(`Signed in as ${ADA.name}`).waitFor();
  });

  it("turns away someone the homelab admin didn't give Notes, before Notes sees them", async () => {
    const page = await newDevice(browser);
    await page.goto(NOTES_URL);
    await onVoidAuthSignIn(page);
    await typePassword(page, BOB);
    await page.waitForURL(
      (url) => url.origin === ACCOUNTS_URL && url.pathname === "/forbidden",
    );
  });

  it("can't claim someone else's name or groups by sending the gateway's headers", async () => {
    const page = await newDevice(browser);
    await signIn(page, EVE);
    expect(
      await sessionFrom(page, {
        "Remote-User": "ada",
        "Remote-Name": "Ada Lovelace",
        "Remote-Groups": "notes-admins",
      }),
    ).toEqual({
      status: 200,
      body: { person: { id: "eve", role: "member", name: null } },
    });
  });

  it("syncs through the gateway only while signed in", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    expect(await syncOpens(page)).toBe(true);
    await page.context().clearCookies({ name: VOIDAUTH_SESSION_COOKIE });
    expect(await syncOpens(page)).toBe(false);
  });
});

describe("signing out", () => {
  it("signs out of the homelab account, so opening Notes again asks for the password", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    await page.getByRole("button", { name: "Sign out" }).click();
    await confirmSignOut(page);
    await onVoidAuthSignIn(page);

    await page.goto(NOTES_URL);
    await onVoidAuthSignIn(page);
  });

  it("leaves the person's other browsers signed in", async () => {
    const page = await newDevice(browser);
    const other = await newDevice(browser);
    await signIn(page, ADA);
    await signIn(other, ADA);
    await page.getByRole("button", { name: "Sign out" }).click();
    await confirmSignOut(page);
    await onVoidAuthSignIn(page);

    await other.reload();
    await other.getByText(`Signed in as ${ADA.name}`).waitFor();
  });

  it("signing out on the homelab's own page signs out Notes, open tabs included", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
    const homelab = await page.context().newPage();
    await homelab.goto(`${ACCOUNTS_URL}/logout`);
    await confirmSignOut(homelab);
    await onVoidAuthSignIn(homelab);

    // Coming back to the open Notes tab.
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await onVoidAuthSignIn(page);

    const reopened = await page.context().newPage();
    await reopened.goto(NOTES_URL);
    await onVoidAuthSignIn(reopened);
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
    await page.getByRole("button", { name: "Sign out" }).click();
    await confirmSignOut(page);
    await onVoidAuthSignIn(page);

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
    await page.context().clearCookies({ name: VOIDAUTH_SESSION_COOKIE });

    const signingIn = page.waitForRequest(`${NOTES_URL}/api/sign-in`);
    await page.context().setOffline(false);
    await signingIn;
    await onVoidAuthSignIn(page);
    expect(
      await page.evaluate(() => localStorage.getItem("notes.person")),
    ).toBe(null);
  });
});

describe("signing out offline", () => {
  const SIGNED_OUT_HERE =
    "Signed out here. Other apps finish signing out next time Notes is online.";

  it("signs out on the device at once, and finishes on the next online start", async () => {
    const page = await newDevice(browser);
    await signIn(page, ADA);
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
    await page.reload();
    await confirmSignOut(page);
    await onVoidAuthSignIn(page);

    await page.goto(NOTES_URL);
    await onVoidAuthSignIn(page);
  });
});
