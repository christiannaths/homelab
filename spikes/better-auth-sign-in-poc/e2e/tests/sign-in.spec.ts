import { expect, test } from "@playwright/test";
import {
  ACCOUNTS,
  ADA,
  ADMIN,
  BOB,
  DANA,
  DOMAIN,
  ENCYCLOPEDIA,
  NOTES,
  SIGN_IN_RATE,
  acceptInvite,
  createInvite,
  newDevice,
  seenByApp,
  setGroups,
  signIn,
  totp,
} from "./stack.ts";

test("one sign-in with email and password opens every app the admin granted", async ({
  browser,
}) => {
  const page = await (await newDevice(browser)).newPage();
  await page.goto(`${NOTES}/some/page?x=1`);
  await signIn(page, ADA);
  await page.waitForURL(`${NOTES}/some/page?x=1`);
  const seen = await seenByApp(page);
  expect(seen).toMatchObject({
    "app": "notes",
    "Remote-Email": ADA.email,
    "Remote-Name": ADA.name,
    "Remote-Groups": ADA.groups.join(","),
  });
  expect(seen["Remote-User"]).toMatch(/^\w{20,}$/);

  await page.goto(`${ENCYCLOPEDIA}/`);
  expect(await seenByApp(page)).toMatchObject({
    "app": "encyclopedia",
    "Remote-User": seen["Remote-User"],
  });

  const cookies = await page.context().cookies();
  expect(
    cookies.find((c) => c.name === "__Secure-homelab.session_token"),
  ).toMatchObject({
    domain: `.${DOMAIN}`,
    httpOnly: true,
    secure: true,
  });
});

test("a wrong password is refused on the sign-in page", async ({ browser }) => {
  const page = await (await newDevice(browser)).newPage();
  await page.goto(`${NOTES}/`);
  await signIn(page, { email: ADA.email, password: "not-the-password" });
  await expect(page.getByRole("alert")).toHaveText(
    /invalid email or password/i,
  );
  await expect(page).toHaveURL(new RegExp(`^${ACCOUNTS}/sign-in`));
});

test("a person without the app's groups gets our no-access page, and nothing reaches the app", async ({
  browser,
}) => {
  const page = await (await newDevice(browser)).newPage();
  await page.goto(`${NOTES}/`);
  await signIn(page, BOB);
  await expect(page.getByRole("heading")).toHaveText(
    "You don't have access to notes",
  );
  await expect(page).toHaveURL(`${NOTES}/`);
  const api = await page.evaluate(async () => {
    const response = await fetch("/api/anything");
    return { status: response.status, text: await response.text() };
  });
  expect(api.status).toBe(403);
  expect(api.text).not.toContain("Remote-User");
});

test("taking an app away takes effect on the person's next request", async ({
  browser,
}) => {
  const dana = await (await newDevice(browser)).newPage();
  await dana.goto(`${ENCYCLOPEDIA}/`);
  await signIn(dana, DANA);
  await dana.waitForURL(`${ENCYCLOPEDIA}/`);

  const admin = await (await newDevice(browser)).newPage();
  await admin.goto(`${ACCOUNTS}/`);
  await signIn(admin, ADMIN);
  await admin.waitForURL(`${ACCOUNTS}/`);
  await setGroups(admin, DANA.email, ["notes"]);

  await dana.reload();
  await expect(dana.getByRole("heading")).toHaveText(
    "You don't have access to encyclopedia",
  );
  await dana.goto(`${NOTES}/`);
  expect((await seenByApp(dana))["Remote-Groups"]).toBe("notes");
});

test("one sign-out signs every app on the device out, and no other device", async ({
  browser,
}) => {
  const laptop = await (await newDevice(browser)).newPage();
  const phone = await (await newDevice(browser)).newPage();
  for (const page of [laptop, phone]) {
    await page.goto(`${NOTES}/`);
    await signIn(page, ADA);
    await page.waitForURL(`${NOTES}/`);
  }
  const encyclopediaTab = await laptop.context().newPage();
  await encyclopediaTab.goto(`${ENCYCLOPEDIA}/`);

  // An app's "Sign out" is a plain link to the accounts service.
  await laptop.goto(`${ACCOUNTS}/sign-out`);
  await laptop.waitForURL(`${ACCOUNTS}/sign-in`);

  await laptop.goto(`${NOTES}/`);
  await expect(laptop).toHaveURL(
    new RegExp(`^${ACCOUNTS}/sign-in\\?return-to=`),
  );
  await encyclopediaTab.reload();
  await expect(encyclopediaTab).toHaveURL(new RegExp(`^${ACCOUNTS}/sign-in`));

  await phone.reload();
  expect((await seenByApp(phone))["Remote-Email"]).toBe(ADA.email);
});

test("a person can't claim someone else's identity through the gateway", async ({
  browser,
}) => {
  const forged = {
    "Remote-User": "someone-else",
    "Remote-Email": "admin@example.com",
    "Remote-Name": "Homelab Admin",
    "Remote-Groups": "auth_admins,notes-admins",
  };
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: forged,
  });
  const page = await context.newPage();
  await page.goto(`${NOTES}/`);
  await expect(page).toHaveURL(new RegExp(`^${ACCOUNTS}/sign-in`));
  await signIn(page, ADA);
  await page.waitForURL(`${NOTES}/`);
  expect(await seenByApp(page)).toMatchObject({
    "Remote-Email": ADA.email,
    "Remote-Name": ADA.name,
    "Remote-Groups": ADA.groups.join(","),
  });
});

test("the sign-in page only sends people back to the homelab's own addresses", async ({
  browser,
}) => {
  const page = await (await newDevice(browser)).newPage();
  await page.goto(
    `${ACCOUNTS}/sign-in?return-to=${encodeURIComponent("https://evil.example/")}`,
  );
  await signIn(page, ADA);
  await page.waitForURL(`${ACCOUNTS}/`);
});

test("an invite makes an account with the invite's apps, and works once", async ({
  browser,
}) => {
  const admin = await (await newDevice(browser)).newPage();
  await admin.goto(`${ACCOUNTS}/`);
  await signIn(admin, ADMIN);
  await admin.waitForURL(`${ACCOUNTS}/`);
  const url = await createInvite(admin, {
    groups: ["notes"],
  });

  const erin = {
    email: "erin@example.com",
    password: "ember-thistle-copper-55",
    name: "Erin",
    groups: ["notes"],
  };
  const page = await (await newDevice(browser)).newPage();
  await acceptInvite(page, url, erin);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Erin");
  await expect(page.getByRole("listitem")).toHaveText(["notes"]);
  await page.goto(`${NOTES}/`);
  expect((await seenByApp(page))["Remote-Email"]).toBe(erin.email);

  const again = await (await newDevice(browser)).newPage();
  const response = await again.goto(url);
  expect(response?.status()).toBe(410);
  await expect(again.getByRole("heading")).toHaveText(
    "This invite can't be used",
  );
});

test("a passkey added on the account page signs the person in on its own", async ({
  browser,
}) => {
  const page = await (await newDevice(browser)).newPage();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  await page.goto(`${ACCOUNTS}/`);
  await signIn(page, ADA);
  await page.waitForURL(`${ACCOUNTS}/`);
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page.locator("#passkey-count")).toHaveText("1 passkey");

  await page.goto(`${ACCOUNTS}/sign-out`);
  await page.goto(`${NOTES}/`);
  await page.waitForURL(`${ACCOUNTS}/sign-in**`);
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await page.waitForURL(`${NOTES}/`);
  expect((await seenByApp(page))["Remote-Email"]).toBe(ADA.email);
});

test("with an authenticator app turned on, signing in needs its code", async ({
  browser,
}) => {
  const admin = await (await newDevice(browser)).newPage();
  await admin.goto(`${ACCOUNTS}/`);
  await signIn(admin, ADMIN);
  await admin.waitForURL(`${ACCOUNTS}/`);
  const frank = {
    email: "frank@example.com",
    password: "willow-quartz-ember-62",
    name: "Frank",
    groups: ["notes"],
  };
  const url = await createInvite(admin, {
    email: frank.email,
    groups: frank.groups,
  });

  const page = await (await newDevice(browser)).newPage();
  await acceptInvite(page, url, frank);
  await page.getByLabel("Password").fill(frank.password);
  await page
    .getByRole("button", { name: "Set up an authenticator app" })
    .click();
  await expect(page.locator("#totp-uri")).toHaveText(
    /^otpauth:\/\/totp\/Homelab:/,
  );
  const uri = await page.locator("#totp-uri").innerText();
  await page.getByLabel("Code from the app").fill(totp(uri));
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.locator("#totp-status")).toHaveText("On");

  await page.goto(`${ACCOUNTS}/sign-out`);
  await page.goto(`${NOTES}/`);
  await signIn(page, frank);
  // The password alone doesn't sign in.
  await expect(
    page.getByLabel("Code from your authenticator app"),
  ).toBeVisible();
  expect(
    (await page.context().cookies()).some(
      (c) => c.name === "__Secure-homelab.session_token",
    ),
  ).toBe(false);
  await page.getByLabel("Code from your authenticator app").fill(totp(uri));
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(`${NOTES}/`);
  expect((await seenByApp(page))["Remote-Email"]).toBe(frank.email);
});

test("repeated sign-in attempts are limited per address, and a forged X-Forwarded-For doesn't help", async ({
  browser,
}) => {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { "X-Forwarded-For": "203.0.113.7" },
  });
  const page = await context.newPage();
  await page.goto(`${ACCOUNTS}/sign-in`);
  // Starts from an empty window: the tests before this one signed in from the same address.
  await page.waitForTimeout(SIGN_IN_RATE.window * 1000);
  const statuses = await page.evaluate(
    async ({ attempts, email }) => {
      const results: number[] = [];
      for (let i = 0; i < attempts; i++) {
        const response = await fetch("/api/auth/sign-in/email", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": `198.51.100.${i}`,
          },
          body: JSON.stringify({ email, password: "wrong-password" }),
        });
        results.push(response.status);
      }
      return results;
    },
    { attempts: SIGN_IN_RATE.max + 3, email: BOB.email },
  );
  expect(statuses.slice(0, 2)).toEqual([401, 401]);
  expect(statuses.at(-1)).toBe(429);
  // Waits out the window so a test run after this one can still sign in.
  await page.waitForTimeout(SIGN_IN_RATE.window * 1000);
});
