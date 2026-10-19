// The gateway must not get in the way of what every app needs: opening offline as an installed
// PWA, and a sync WebSocket. And a sign-out must not leave an app's offline copy readable.
import { expect, test } from "@playwright/test";
import { ADA, AUTH, ENCYCLOPEDIA, NOTES, newDevice, signIn } from "./stack.ts";

test("the app syncs over a WebSocket through the gateway and opens offline", async ({
  browser,
}) => {
  const device = await newDevice(browser);
  const page = await device.newPage();
  await page.goto(`${NOTES}/`);
  await signIn(page, ADA);
  await expect(page.locator("#sync")).toHaveText("Sync connected as ada");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect(page.locator("#network")).toHaveText("Online");

  await device.setOffline(true);
  await page.reload();
  await expect(page.locator("#network")).toHaveText("Offline");
  await expect(page.locator("#who")).toHaveText(
    "Signed in as Ada Lovelace (ada), admin",
  );
});

test("the Encyclopedia's own service worker opens it offline through the gateway", async ({
  browser,
}) => {
  const device = await newDevice(browser);
  const page = await device.newPage();
  await page.goto(`${ENCYCLOPEDIA}/`);
  await signIn(page, ADA);
  await page.waitForURL(`${ENCYCLOPEDIA}/`);
  await page.evaluate(() => navigator.serviceWorker.ready);

  await device.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Encyclopedia" }),
  ).toBeVisible();
});

test("after signing out in another app, the next online visit wipes the offline copy", async ({
  browser,
}) => {
  const device = await newDevice(browser);
  const notes = await device.newPage();
  await notes.goto(`${NOTES}/`);
  await signIn(notes, ADA);
  await expect(notes.locator("#sync")).toHaveText("Sync connected as ada");
  await notes.evaluate(() => navigator.serviceWorker.ready);

  const encyclopedia = await device.newPage();
  await encyclopedia.goto(`${ENCYCLOPEDIA}/`);
  await encyclopedia.goto(`${AUTH}/logout`);
  await encyclopedia.locator('button[name="logout"][value="yes"]').click();
  await encyclopedia.waitForURL(`${AUTH}/login**`);

  // Notes' service worker sees the gateway's redirect and deletes what Notes kept.
  await notes.reload();
  await notes.waitForURL(`${AUTH}/login**`);
  await device.setOffline(true);
  await expect(notes.goto(`${NOTES}/`)).rejects.toThrow(
    /ERR_INTERNET_DISCONNECTED|ERR_FAILED/,
  );
});

test("signed out while offline, the app still opens offline until it is next online", async ({
  browser,
}) => {
  const device = await newDevice(browser);
  const notes = await device.newPage();
  await notes.goto(`${NOTES}/`);
  await signIn(notes, ADA);
  await expect(notes.locator("#sync")).toHaveText("Sync connected as ada");
  await notes.evaluate(() => navigator.serviceWorker.ready);

  const encyclopedia = await device.newPage();
  await encyclopedia.goto(`${ENCYCLOPEDIA}/`);
  await encyclopedia.goto(`${AUTH}/logout`);
  await encyclopedia.locator('button[name="logout"][value="yes"]').click();
  await encyclopedia.waitForURL(`${AUTH}/login**`);

  // Notes never ran online since the sign-out, so it can't know about it yet.
  await device.setOffline(true);
  await notes.reload();
  await expect(notes.locator("#who")).toHaveText(
    "Signed in as Ada Lovelace (ada), admin",
  );
});
