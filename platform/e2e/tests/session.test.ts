// Keeping a session going (ADR-PLAT-004): on every page load, the App switcher asks the accounts
// service to extend the session, so a person who only uses apps stays signed in.
import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  ACCOUNTS_URL,
  ADA,
  ENCYCLOPEDIA_URL,
  launchChromium,
  newDevice,
  NOTES_URL,
  signIn,
  tab,
} from "./stack.ts";

let browser: Browser;

beforeAll(async () => {
  browser = await launchChromium(inject("gatewayCaSpki"));
});
afterAll(async () => {
  await browser?.close();
});

describe("the App switcher keeping the session going", () => {
  for (const app of [
    { name: "Notes", url: NOTES_URL },
    { name: "Encyclopedia", url: ENCYCLOPEDIA_URL },
  ])
    it(`asks the accounts service on every load of ${app.name}, with no errors`, async () => {
      const page = await newDevice(browser);
      await signIn(page, ADA);
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      const asked = page.waitForResponse(
        (response) =>
          response.url() === `${ACCOUNTS_URL}/session` &&
          response.request().method() === "POST",
      );
      await page.goto(app.url);
      await tab(page).waitFor();
      expect((await asked).status()).toBe(204);
      expect(errors).toEqual([]);
    });
});
