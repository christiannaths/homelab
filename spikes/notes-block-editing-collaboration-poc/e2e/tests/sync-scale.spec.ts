import { expect, test } from "@playwright/test";
import { openApp, waitForServiceWorker } from "./helpers";
import { TestServer } from "./server";

// Gate for keeping Hocuspocus as the sync server (see docs/adr): a 2,000-page workspace
// must sync to a new device and survive repeated reconnects and a server restart
// without the server dropping connections. Slow, so opt-in: SLOW=1 npm run test:e2e
test.skip(!process.env.SLOW, "set SLOW=1 to run");
test.setTimeout(15 * 60_000);

const PAGES = 2000;

test(`${PAGES}-page workspace: initial sync, reconnects, server restart`, async ({
  browser,
}) => {
  const server = new TestServer();
  await server.start();
  const results: Record<string, string> = {};
  const timed = async (label: string, fn: () => Promise<void>) => {
    const t = Date.now();
    await fn();
    results[label] = `${((Date.now() - t) / 1000).toFixed(1)} s`;
  };
  const allSynced = (page: import("@playwright/test").Page, total: number) =>
    expect
      .poll(
        () =>
          page.evaluate(() => {
            const s = (window as any).__localnotion.getSnapshot();
            return s.connection === "connected" &&
              s.synced === s.total &&
              s.pendingChanges === 0
              ? s.total
              : -1;
          }),
        { timeout: 10 * 60_000, intervals: [250] },
      )
      .toBe(total);

  try {
    const alice = await (await browser.newContext()).newPage();
    await openApp(alice, server.url);
    await alice.goto(`${server.url}/#/diagnostics`);
    await timed(`alice: create ${PAGES} pages and sync them`, async () => {
      for (let i = 0; i < PAGES / 500; i++) {
        await alice
          .getByRole("button", { name: "Create 500 test pages" })
          .click();
        await expect(alice.getByTestId("seed-status")).toHaveText(
          /Created 500 pages/,
          { timeout: 120_000 },
        );
      }
      await allSynced(alice, PAGES + 1);
    });

    const bobCtx = await browser.newContext();
    const bob = await bobCtx.newPage();
    await timed(
      `bob (new device): download all ${PAGES + 1} docs`,
      async () => {
        await bob.goto(`${server.url}/#/diagnostics`);
        await allSynced(bob, PAGES + 1);
      },
    );
    await waitForServiceWorker(bob);

    for (let i = 1; i <= 3; i++) {
      await bobCtx.setOffline(true);
      await expect(bob.getByTestId("sync-badge")).toHaveText(/Offline/);
      await timed(
        `bob: reconnect #${i} until every doc re-synced`,
        async () => {
          await bobCtx.setOffline(false);
          await allSynced(bob, PAGES + 1);
        },
      );
    }

    await timed("server restart: both devices re-synced", async () => {
      await server.stop();
      await server.start();
      await Promise.all([
        allSynced(alice, PAGES + 1),
        allSynced(bob, PAGES + 1),
      ]);
    });

    await timed(
      "bob: warm reload (online) until every doc re-synced",
      async () => {
        await bob.reload();
        await allSynced(bob, PAGES + 1);
      },
    );

    const heapMB = await bob.evaluate(
      () => ((performance as any).memory?.usedJSHeapSize ?? 0) / 1e6,
    );
    results["bob: JS heap with all docs open (Chromium)"] =
      `${heapMB.toFixed(0)} MB`;

    console.log(`\nSync scale results (${PAGES} pages, ~30 paragraphs each):`);
    for (const [k, v] of Object.entries(results)) console.log(`  ${k}: ${v}`);

    const dropped = server.logs.filter((l) => /closing connection/i.test(l));
    expect(dropped, "server dropped connections").toEqual([]);
  } finally {
    await server.stop();
  }
});
