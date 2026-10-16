import { expect, test } from "@playwright/test";
import { createPage, editor, editorText, openApp, waitForServiceWorker, waitForSynced } from "./helpers";
import { TestServer } from "./server";

let server: TestServer;

test.beforeEach(async () => {
  server = new TestServer();
  await server.start();
});

test.afterEach(async () => {
  await server.stop();
});

test("two users see each other's edits live", async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage();
  const bob = await (await browser.newContext()).newPage();
  await openApp(alice, server.url);
  await openApp(bob, server.url);

  const hash = await createPage(alice, "Shared plan", "Hello from Alice");

  // The new page appears in Bob's sidebar, and its content arrives.
  await expect(bob.getByTestId("page-tree")).toContainText("Shared plan");
  await bob.goto(`${server.url}/${hash}`);
  await expect(editor(bob)).toContainText("Hello from Alice");

  // Bob types, and Alice sees it without reloading.
  await editor(bob).click();
  await bob.keyboard.press("ControlOrMeta+End");
  await bob.keyboard.type(" and Bob");
  await expect.poll(() => editorText(alice)).toBe("Hello from Alice and Bob");

  // Presence: Alice sees Bob's cursor label.
  await expect(alice.locator(".bn-collaboration-cursor__label").first()).toBeVisible();
});

test("app cold-starts with no network and offline edits merge on reconnect", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await (await browser.newContext()).newPage();

  await openApp(alice, server.url);
  await waitForServiceWorker(alice);
  const hash = await createPage(alice, "Trip notes", "Packed passport.");
  await waitForSynced(alice);

  // The device goes offline, then the app is closed and reopened: it must boot from the service worker + IndexedDB.
  await aliceCtx.setOffline(true);
  await alice.reload();
  await expect(alice.getByTestId("page-tree")).toContainText("Trip notes");
  await expect(alice.getByTestId("sync-badge")).toHaveText(/Offline/);
  await expect(editor(alice)).toContainText("Packed passport.");

  // Edit while offline. A new page too.
  await editor(alice).click();
  await alice.keyboard.press("ControlOrMeta+End");
  await alice.keyboard.type(" Bought adapters offline.");
  await createPage(alice, "Offline-only page", "Written on the plane.");

  // Meanwhile Bob edits the same page online.
  await openApp(bob, server.url);
  await bob.goto(`${server.url}/${hash}`);
  await expect(editor(bob)).toContainText("Packed passport.");
  // Put the caret at the very start of the first paragraph.
  await bob.locator(".bn-inline-content").first().click({ position: { x: 1, y: 8 } });
  await bob.keyboard.type("Bob: ");
  await expect.poll(() => editorText(bob)).toBe("Bob: Packed passport.");
  await expect(editor(bob)).not.toContainText("Bought adapters");

  // Reconnect: both sides converge on the merged content.
  await aliceCtx.setOffline(false);
  await waitForSynced(alice);
  for (const p of [alice, bob]) {
    await p.goto(`${server.url}/${hash}`);
    await expect.poll(() => editorText(p)).toBe("Bob: Packed passport. Bought adapters offline.");
  }
  await expect(bob.getByTestId("page-tree")).toContainText("Offline-only page");
});

test("edits made while the server is down sync after it restarts, and data survives restarts", async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage();
  await openApp(alice, server.url);
  await waitForServiceWorker(alice);
  const hash = await createPage(alice, "Homelab", "Server was up.");
  await waitForSynced(alice);

  await server.stop();
  await expect(alice.getByTestId("sync-badge")).toHaveText(/Offline/);
  await alice.reload(); // reopening the app while the server is down still works
  await expect(editor(alice)).toContainText("Server was up.");
  await editor(alice).click();
  await alice.keyboard.press("ControlOrMeta+End");
  await alice.keyboard.type(" Server was down.");

  await server.start();
  await waitForSynced(alice);
  // Let the server's debounced write reach SQLite, then restart it again.
  await alice.waitForTimeout(1500);
  await server.stop();
  await server.start();

  // A brand-new device gets everything from the server.
  const carol = await (await browser.newContext()).newPage();
  await carol.goto(`${server.url}/${hash}`);
  await expect(editor(carol)).toContainText("Server was up. Server was down.");
});
