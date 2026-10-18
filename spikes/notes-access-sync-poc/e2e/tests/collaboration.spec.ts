import { expect, test, type Page } from "@playwright/test";
import { TestServer } from "@homelab/notes-access-sync-poc-server/testing";
import {
  createPage,
  editor,
  editorText,
  openAs,
  pickPerson,
  section,
  sharePage,
  waitForServiceWorker,
  waitForSynced,
} from "./helpers.ts";

let server: TestServer;

test.beforeEach(async () => {
  server = new TestServer({ echo: true });
  await server.start();
});

test.afterEach(async () => {
  await server.stop();
});

test("the first person sets up the workspace as owner and adds a member, who picks who they are", async ({
  browser,
}) => {
  const alice = await (await browser.newContext()).newPage();
  await alice.goto(server.url);
  await alice.getByTestId("setup-name").fill("Alice");
  await alice.getByTestId("setup-submit").click();
  await expect(alice.getByTestId("current-person")).toHaveText("Alice");
  await expect(alice.getByTestId("current-role")).toHaveText("owner");

  await alice.getByTestId("people-link").click();
  await alice.getByTestId("add-person-name").fill("Bob");
  await alice.getByTestId("add-person-role").selectOption("member");
  await alice.getByTestId("add-person-submit").click();
  await alice.getByTestId("add-person-name").fill("Gwen");
  await alice.getByTestId("add-person-role").selectOption("guest");
  await alice.getByTestId("add-person-submit").click();
  await expect(alice.getByTestId("person-row")).toHaveText([
    /Alice.*owner/,
    /Bob.*member/,
    /Gwen.*guest/,
  ]);

  const bob = await (await browser.newContext()).newPage();
  await bob.goto(server.url);
  await expect(bob.getByTestId("person-option")).toHaveText([
    /Alice/,
    /Bob/,
    /Gwen/,
  ]);
  await pickPerson(bob, "Bob");
  await expect(bob.getByTestId("people-link")).toHaveCount(0); // only owners add people

  // The server knows which person each connection belongs to.
  await expect
    .poll(
      async () => new Set((await server.connections()).map((c) => c.personId)),
    )
    .toEqual(
      new Set(
        (await server.people())
          .filter((p) => p.name !== "Gwen")
          .map((p) => p.id),
      ),
    );
});

test("two people co-edit a shared page live", async ({ browser }) => {
  const owner = await server.addPerson("Alice");
  await server.addPerson("Bob", "member", owner);
  const alice = await openAs(browser, server.url, "Alice");
  const bob = await openAs(browser, server.url, "Bob");

  const route = await createPage(alice, "Shared plan", "Hello from Alice");
  await sharePage(alice, "Bob", "Can edit");
  await expect(section(bob, "shared").getByTestId("tree-row")).toHaveText([
    /Shared plan/,
  ]);
  await bob.goto(`${server.url}/${route}`);
  await expect(editor(bob)).toContainText("Hello from Alice");

  await editor(bob).click();
  await bob.keyboard.press("ControlOrMeta+End");
  await bob.keyboard.type(" and Bob");
  await expect.poll(() => editorText(alice)).toBe("Hello from Alice and Bob");
  // Presence: Alice sees Bob's cursor, labelled with his name.
  await expect(
    alice.locator(".bn-collaboration-cursor__label").filter({ hasText: "Bob" }),
  ).toBeVisible();
});

test("an offline edit merges with another person's live edit after reconnecting", async ({
  browser,
}) => {
  const owner = await server.addPerson("Alice");
  await server.addPerson("Bob", "member", owner);
  const alice = await openAs(browser, server.url, "Alice");
  await waitForServiceWorker(alice);
  const route = await createPage(alice, "Trip notes", "Packed passport.");
  await sharePage(alice, "Bob", "Can edit");
  await waitForSynced(alice);

  // Alice goes offline and the app is reopened: it boots from the service worker and IndexedDB,
  // still as Alice.
  await alice.context().setOffline(true);
  await alice.reload();
  await expect(alice.getByTestId("current-person")).toHaveText("Alice");
  await expect(alice.getByTestId("sync-badge")).toHaveText(/Offline/);
  await expect(editor(alice)).toContainText("Packed passport.");
  await editor(alice).click();
  await alice.keyboard.press("ControlOrMeta+End");
  await alice.keyboard.type(" Bought adapters offline.");

  // Meanwhile Bob edits the same page online.
  const bob = await openAs(browser, server.url, "Bob");
  await bob.goto(`${server.url}/${route}`);
  await expect(editor(bob)).toContainText("Packed passport.");
  await bob
    .locator(".bn-inline-content")
    .first()
    .click({ position: { x: 1, y: 8 } });
  await bob.keyboard.type("Bob: ");
  await expect.poll(() => editorText(bob)).toBe("Bob: Packed passport.");

  await alice.context().setOffline(false);
  await waitForSynced(alice);
  for (const p of [alice, bob]) {
    await expect
      .poll(() => editorText(p))
      .toBe("Bob: Packed passport. Bought adapters offline.");
  }
});

test("two people with Can edit both edit a shared page offline, and both edits merge after reconnecting", async ({
  browser,
}) => {
  const owner = await server.addPerson("Alice");
  await server.addPerson("Bob", "member", owner);
  await server.addPerson("Carol", "member", owner);
  const alice = await openAs(browser, server.url, "Alice");
  const route = await createPage(alice, "Trip notes", "Packed passport.");
  await sharePage(alice, "Bob", "Can edit");
  await sharePage(alice, "Carol", "Can edit");
  await waitForSynced(alice);

  // Bob and Carol each open the page online once, then go offline and reopen the app.
  const devices: Page[] = [];
  for (const name of ["Bob", "Carol"]) {
    const device = await openAs(browser, server.url, name);
    await waitForServiceWorker(device);
    await device.goto(`${server.url}/${route}`);
    await expect(editor(device)).toContainText("Packed passport.");
    await waitForSynced(device);
    await device.context().setOffline(true);
    await device.reload();
    await expect(device.getByTestId("sync-badge")).toHaveText(/Offline/);
    await expect(device.getByTestId("page")).toHaveAttribute(
      "data-level",
      "edit",
    );
    await expect(editor(device)).toContainText("Packed passport.");
    devices.push(device);
  }
  const [bob, carol] = devices;

  // Both edit the same paragraph while offline: Bob at its start, Carol at its end.
  await bob
    .locator(".bn-inline-content")
    .first()
    .click({ position: { x: 1, y: 8 } });
  await bob.keyboard.type("Bob: ");
  await expect.poll(() => editorText(bob)).toBe("Bob: Packed passport.");
  await editor(carol).click();
  await carol.keyboard.press("ControlOrMeta+End");
  await carol.keyboard.type(" Carol bought adapters.");
  await expect
    .poll(() => editorText(carol))
    .toBe("Packed passport. Carol bought adapters.");

  for (const device of [bob, carol]) await device.context().setOffline(false);
  for (const device of [bob, carol]) await waitForSynced(device);
  for (const device of [alice, bob, carol]) {
    await expect
      .poll(() => editorText(device))
      .toBe("Bob: Packed passport. Carol bought adapters.");
  }
  // Neither edit was refused: Can edit may change the page's content.
  expect(await server.refusals()).toEqual([]);
});
