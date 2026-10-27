// Notes through the real gateway and accounts service (ADR-PLAT-009): the one place the real
// platform and a real app are proven together, since Notes' own suite runs it behind a stand-in.
// Notes learns who is there, and their level in it, from the identity headers alone.
import { identityHeaders } from "@homelab/identity";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  ADA,
  type Account,
  DANA,
  launchChromium,
  newDevice,
  NOTES_URL,
  onSignInPage,
  SESSION_COOKIE,
  typePassword,
} from "./stack.ts";

let browser: Browser;

beforeAll(async () => {
  browser = await launchChromium(inject("gatewayCaSpki"));
});
afterAll(async () => {
  await browser?.close();
});

const idOf = (account: Account) => inject("accountIds")[account.email];

/** Opens Notes signed out and signs in on the accounts service's page. */
async function openNotes(page: Page, account: Account): Promise<void> {
  await page.goto(NOTES_URL);
  await onSignInPage(page);
  await typePassword(page, account);
  await page.getByText(`Signed in as ${account.name}`).waitFor();
}

/** What Notes' API says about the signed-in person, asked from a Notes page. */
function sessionFrom(page: Page, headers: Record<string, string> = {}) {
  return page.evaluate(async (sent) => {
    const response = await fetch("/api/session", { headers: sent });
    return (await response.json()) as unknown;
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

describe("Notes through the gateway", () => {
  it("knows an owner by their account id, and syncs only while they are signed in", async () => {
    const page = await newDevice(browser);
    await openNotes(page, ADA);
    expect(await sessionFrom(page)).toMatchObject({
      person: { id: idOf(ADA), role: "owner", name: ADA.name },
    });
    expect(await syncOpens(page)).toBe(true);

    await page.context().clearCookies({ name: SESSION_COOKIE });
    expect(await syncOpens(page)).toBe(false);
  });

  it("knows a member by their account id", async () => {
    const page = await newDevice(browser);
    await openNotes(page, DANA);
    expect(await sessionFrom(page)).toMatchObject({
      person: { id: idOf(DANA), role: "member", name: DANA.name },
    });
  });

  it("can't be told someone else's name or level by a browser sending the identity headers", async () => {
    const page = await newDevice(browser);
    await openNotes(page, DANA);
    expect(
      await sessionFrom(
        page,
        identityHeaders({
          id: idOf(ADA),
          name: ADA.name,
          email: null,
          access: { notes: "admin" },
        }),
      ),
    ).toEqual({
      person: { id: idOf(DANA), role: "member", name: DANA.name },
    });
  });
});
