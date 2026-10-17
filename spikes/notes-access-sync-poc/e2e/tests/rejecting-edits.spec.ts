import { expect, test, type Page } from "@playwright/test";
import { TestServer } from "@homelab/notes-access-sync-poc-server/testing";
import {
  createPage, editor, editorText, openAs, sharePage, storedDocNames, waitForServiceWorker, waitForSynced,
} from "./helpers.ts";

let server: TestServer;

test.beforeEach(async () => {
  server = new TestServer({ echo: true });
  await server.start();
});

test.afterEach(async () => {
  await server.stop();
});

/** Alice's page, shared with Bob at `level`; returns both devices, with Bob's showing the page. */
async function sharedWithBob(browser: import("@playwright/test").Browser, level: string) {
  const owner = await server.addPerson("Alice");
  await server.addPerson("Bob", "member", owner);
  const alice = await openAs(browser, server.url, "Alice");
  const route = await createPage(alice, "House manual", "Bins go out on Tuesday");
  await sharePage(alice, "Bob", level);
  await waitForSynced(alice);
  const bob = await openAs(browser, server.url, "Bob");
  await waitForServiceWorker(bob);
  await bob.goto(`${server.url}/${route}`);
  await expect(editor(bob)).toContainText("Bins go out on Tuesday");
  await waitForSynced(bob);
  return { alice, bob, route, id: route.replace("#/page/", "") };
}

async function expectReadOnly(page: Page, level: string) {
  await expect(page.getByTestId("page")).toHaveAttribute("data-level", level);
  await expect(editor(page)).toHaveAttribute("contenteditable", "false");
  await expect(page.getByTestId("page-title")).toHaveAttribute("readonly", "");
}

test("a page shared at Can comment opens read-only, online and offline", async ({ browser }) => {
  const { bob } = await sharedWithBob(browser, "Can comment");
  await expectReadOnly(bob, "comment");

  await bob.context().setOffline(true);
  await bob.reload();
  await expect(bob.getByTestId("sync-badge")).toHaveText(/Offline/);
  await expect(editor(bob)).toContainText("Bins go out on Tuesday");
  await expectReadOnly(bob, "comment");
});

test("a forged edit from a Can view device is refused, and the device drops it from memory and storage", async ({ browser }) => {
  const { alice, bob, id } = await sharedWithBob(browser, "Can view");
  await expectReadOnly(bob, "view");

  // A modified client writes anyway, straight into the page's Yjs document.
  await bob.evaluate((pageId) => {
    const sync = (window as unknown as { __notesSync: { get(n: string): { doc: { getMap(n: string): Map<string, unknown> } } } }).__notesSync;
    sync.get(`page:${pageId}`).doc.getMap("meta").set("title", "Hacked");
  }, id);

  await expect.poll(() => server.refusals()).toEqual([{ personId: expect.any(String), documentName: `page:${id}`, reason: "read-only" }]);
  // Bob's device throws its copy away and syncs the server's: the forged title goes, and nothing waits to be sent.
  await expect(bob.getByTestId("page-title")).toHaveValue("House manual");
  await waitForSynced(bob);
  await expect(alice.getByTestId("page-title")).toHaveValue("House manual");

  // It still follows the page.
  await editor(alice).click();
  await alice.keyboard.press("ControlOrMeta+End");
  await alice.keyboard.type(" and Friday");
  await expect.poll(() => editorText(bob)).toBe("Bins go out on Tuesday and Friday");
  await expectReadOnly(bob, "view");

  // The stored copy was replaced too: offline, the app reopens with the server's version.
  expect((await storedDocNames(bob)).filter((n) => n.endsWith(`:page:${id}`))).toHaveLength(1);
  await waitForSynced(bob);
  await bob.context().setOffline(true);
  await bob.reload();
  await expect(bob.getByTestId("sync-badge")).toHaveText(/Offline/);
  await expect(bob.getByTestId("page-title")).toHaveValue("House manual");
  await expect.poll(() => editorText(bob)).toBe("Bins go out on Tuesday and Friday");
  await expectReadOnly(bob, "view");

  // Back online, the forged edit is not sent again.
  await bob.context().setOffline(false);
  await waitForSynced(bob);
  expect(await server.refusals()).toHaveLength(1);
});
