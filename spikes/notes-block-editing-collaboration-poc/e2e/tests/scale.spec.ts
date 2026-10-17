import { expect, test } from "@playwright/test";
import { openApp, waitForServiceWorker, waitForSynced } from "./helpers";
import { TestServer } from "./server";

// Measures the second risk in the architecture doc: startup and sync time with many docs.
// Results are printed; the assertions are deliberately loose budgets.
test("startup and sync with 100+ documents", async ({ browser }) => {
  const server = new TestServer();
  await server.start();
  try {
    const alice = await (await browser.newContext()).newPage();
    await openApp(alice, server.url);
    await alice.goto(`${server.url}/#/diagnostics`);
    // Two batches: more than Hocuspocus's default limit of 100 pending docs per connection.
    for (let i = 0; i < 2; i++) {
      await alice.getByTestId("seed-100").click();
      await expect(alice.getByTestId("seed-status")).toHaveText(
        /Created 100 pages/,
      );
    }
    await waitForSynced(alice);
    await expect(alice.getByTestId("diag-total")).toHaveText("201");

    const results: Record<string, string> = {};

    // A new device downloads the whole workspace.
    const bobCtx = await browser.newContext();
    const bob = await bobCtx.newPage();
    await bob.goto(`${server.url}/#/diagnostics`);
    await expect(bob.getByTestId("diag-total")).toHaveText("201", {
      timeout: 60_000,
    });
    await expect(bob.getByTestId("diag-synced")).toHaveText("201", {
      timeout: 60_000,
    });
    results["new device: all 201 docs synced"] = (await bob
      .getByTestId("diag-synced-ms")
      .textContent())!;
    await waitForServiceWorker(bob);
    await waitForSynced(bob);

    // Warm start online: everything comes from IndexedDB, then is checked against the server.
    await bob.reload();
    await expect(bob.getByTestId("diag-local")).toHaveText("201");
    await expect(bob.getByTestId("diag-synced")).toHaveText("201");
    results["warm start online: all docs loaded locally"] = (await bob
      .getByTestId("diag-local-ms")
      .textContent())!;
    results["warm start online: all docs synced"] = (await bob
      .getByTestId("diag-synced-ms")
      .textContent())!;

    // Warm start offline.
    await bobCtx.setOffline(true);
    await bob.reload();
    await expect(bob.getByTestId("diag-local")).toHaveText("201");
    results["warm start offline: all docs loaded locally"] = (await bob
      .getByTestId("diag-local-ms")
      .textContent())!;

    console.log("\nScale results (201 docs, each ~30 paragraphs):");
    for (const [k, v] of Object.entries(results)) console.log(`  ${k}: ${v}`);
    test.info().annotations.push(
      ...Object.entries(results).map(([type, description]) => ({
        type,
        description,
      })),
    );

    const ms = (s: string) => Number(s.replace(/[^\d]/g, ""));
    expect(
      ms(results["warm start offline: all docs loaded locally"]),
    ).toBeLessThan(10_000);
  } finally {
    await server.stop();
  }
});
