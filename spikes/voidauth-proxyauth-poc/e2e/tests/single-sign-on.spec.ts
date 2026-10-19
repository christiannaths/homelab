// Christian's "Google accounts" model, end to end through the gateway: one sign-in for every app
// the admin granted, a refusal from the others, and one sign-out for every app on the device.
import { expect, test, type Page } from "@playwright/test";
import {
  ADA,
  ADMIN,
  AUTH,
  BOB,
  DANA,
  DOMAIN,
  ENCYCLOPEDIA,
  NOTES,
  isRecord,
  records,
  stringField,
  newDevice,
  signIn,
  voidauthApi,
} from "./stack.ts";

const who = (page: Page) => page.locator("#who");
const encyclopediaTitle = (page: Page) =>
  page.getByRole("heading", { name: "Encyclopedia" });

/** Opens the app's sync WebSocket from a page, as the app's own code would. */
function openSync(page: Page, app: string): Promise<"open" | "refused"> {
  return page.evaluate(
    (url) =>
      new Promise((resolve) => {
        const socket = new WebSocket(url);
        socket.addEventListener("open", () => {
          socket.close();
          resolve("open");
        });
        socket.addEventListener("error", () => resolve("refused"));
      }),
    `${app.replace("https:", "wss:")}/sync`,
  );
}

test("one sign-in opens every app the admin granted", async ({ browser }) => {
  const page = await (await newDevice(browser)).newPage();
  await page.goto(`${NOTES}/`);
  await signIn(page, ADA);
  await page.waitForURL(`${NOTES}/`);
  await expect(who(page)).toHaveText("Signed in as Ada Lovelace (ada), admin");

  // No second sign-in: VoidAuth's session cookie is on the parent domain.
  await page.goto(`${ENCYCLOPEDIA}/`);
  await expect(encyclopediaTitle(page)).toBeVisible();
  expect(page.url()).toBe(`${ENCYCLOPEDIA}/`);
  const session = (await page.context().cookies()).find(
    (c) => c.name === "x-voidauth-session",
  );
  expect(session).toMatchObject({
    domain: `.${DOMAIN}`,
    httpOnly: true,
    secure: true,
  });
});

test("an app the person wasn't granted refuses them", async ({ browser }) => {
  const page = await (await newDevice(browser)).newPage();
  await page.goto(`${ENCYCLOPEDIA}/`);
  await signIn(page, BOB);
  await page.waitForURL(`${ENCYCLOPEDIA}/`);
  await expect(encyclopediaTitle(page)).toBeVisible();

  await page.goto(`${NOTES}/`);
  await page.waitForURL(`${AUTH}/forbidden?reason=user_group_missing`);
  // Nothing from Notes reaches the browser, its API and sync included.
  await page.goto(`${NOTES}/api/me`);
  await page.waitForURL(`${AUTH}/forbidden?reason=user_group_missing`);
  expect(await openSync(page, NOTES)).toBe("refused");
});

test("one sign-out signs every app on the device out, and no other device", async ({
  browser,
}) => {
  const laptop = await newDevice(browser);
  const notes = await laptop.newPage();
  await notes.goto(`${NOTES}/`);
  await signIn(notes, ADA);
  await expect(who(notes)).toContainText("(ada)");
  const encyclopedia = await laptop.newPage();
  await encyclopedia.goto(`${ENCYCLOPEDIA}/`);
  await expect(encyclopediaTitle(encyclopedia)).toBeVisible();
  await encyclopedia.evaluate(() => navigator.serviceWorker.ready);

  const phone = await (await newDevice(browser)).newPage();
  await phone.goto(`${NOTES}/`);
  await signIn(phone, ADA);
  await expect(who(phone)).toContainText("(ada)");

  // Signing out from inside Notes: VoidAuth asks to confirm, then shows its sign-in page.
  await notes.locator("#sign-out").click();
  await notes.locator('button[name="logout"][value="yes"]').click();
  await notes.waitForURL(`${AUTH}/login**`);

  // The Encyclopedia's service worker answers page loads from its cache (Workbox's
  // navigateFallback), so its title page still opens without asking the gateway. Anything it
  // fetches from the server goes to sign-in.
  await encyclopedia.reload();
  await expect(encyclopediaTitle(encyclopedia)).toBeVisible();
  expect(encyclopedia.url()).toBe(`${ENCYCLOPEDIA}/`);
  await encyclopedia.goto(`${ENCYCLOPEDIA}/api/articles`);
  await encyclopedia.waitForURL(`${AUTH}/login**`);
  await notes.goto(`${NOTES}/`);
  await notes.waitForURL(`${AUTH}/login**`);
  expect(await openSync(notes, NOTES)).toBe("refused");

  await phone.reload();
  await expect(who(phone)).toContainText("(ada)");
});

test("a person can't claim someone else's name or groups through the gateway", async ({
  browser,
}) => {
  const page = await (await newDevice(browser)).newPage();
  await page.goto(`${NOTES}/`);
  await signIn(page, ADA);
  await expect(who(page)).toContainText("(ada)");

  // Ada has no email: the gateway must drop her forged Remote-Email, not pass it on.
  const me = await page.evaluate(async () => {
    const response = await fetch("/api/me", {
      headers: {
        "Remote-User": "bob",
        "Remote-Groups": "auth_admins",
        "Remote-Email": "ada@example.com",
      },
    });
    return response.text();
  });
  expect(JSON.parse(me)).toMatchObject({
    person: {
      username: "ada",
      name: "Ada Lovelace",
      email: null,
      groups: ["encyclopedia", "notes", "notes-admins"],
      level: "admin",
    },
  });
});

test("taking an app away from someone applies on their next request", async ({
  browser,
}) => {
  const page = await (await newDevice(browser)).newPage();
  await page.goto(`${NOTES}/`);
  await signIn(page, DANA);
  await expect(who(page)).toContainText("(dana)");

  const admin = await (await newDevice(browser)).newPage();
  await admin.goto(`${AUTH}/`);
  await signIn(admin, ADMIN);
  await admin.waitForURL(`${AUTH}/`);
  const groups = records(
    await voidauthApi(admin, "Listing groups", "GET", "/admin/groups"),
  );
  const id = stringField(
    groups.find((g) => g.name === "notes"),
    "id",
  );
  const group = await voidauthApi(
    admin,
    "Reading group",
    "GET",
    `/admin/group/${id}`,
  );
  const members = records(isRecord(group) ? group.users : undefined);
  await voidauthApi(admin, "Removing Dana from Notes", "POST", "/admin/group", {
    id,
    name: "notes",
    mfaRequired: false,
    autoAssign: false,
    users: members
      .filter((user) => user.username !== DANA.username)
      .map((user) => ({
        id: stringField(user, "id"),
        username: stringField(user, "username"),
      })),
    customClaims: [],
  });

  await page.reload();
  await page.waitForURL(`${AUTH}/forbidden?reason=user_group_missing`);
  await page.goto(`${ENCYCLOPEDIA}/`);
  await expect(encyclopediaTitle(page)).toBeVisible();
});
