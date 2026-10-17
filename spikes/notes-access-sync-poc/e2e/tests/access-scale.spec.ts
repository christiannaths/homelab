import { writeFileSync } from "node:fs";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { connectAs, DEFAULT_LAYOUT, seedWorkspace, TestServer, type SeedLayout } from "@homelab/notes-access-sync-poc-server/testing";
import type { Person } from "@homelab/notes-access-sync-poc-model";

// Startup and sync speed at the ADR 4 scale (#22), the same scenarios as the old spike's opt-in
// sync-scale test (the ADR 11 gate), but with per-person sync: each device receives only what its
// person can open. Slow, so opt-in:
//   SLOW=1 PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium npx nx e2e notes-access-sync-poc-e2e -- access-scale
// SCALE_REPEATS (default 3) repeats each measurement; SCALE (default 1) shrinks the seeded
// workspace for a quick dry run; SCALE_RESULTS=<file> also writes the raw results as JSON;
// SCALE_SYNC_TIMEOUT (ms, default 10 min) bounds each wait; SCALE_PROFILE=<file> saves a Chromium
// CPU profile of Olive's first warm reload (open it in DevTools' Performance panel).
test.skip(!process.env.SLOW, "set SLOW=1 to run");
test.setTimeout(60 * 60_000);

const REPEATS = Number(process.env.SCALE_REPEATS ?? 3);
const FACTOR = Number(process.env.SCALE ?? 1);
const layout = Object.fromEntries(
  Object.entries(DEFAULT_LAYOUT).map(([k, v]) => [k, Math.max(1, Math.round(v * FACTOR))]),
) as unknown as SeedLayout;
const SYNC_TIMEOUT = Number(process.env.SCALE_SYNC_TIMEOUT ?? 10 * 60_000);

type Who = "olive" | "max" | "gus";

test(`per-person sync of a seeded workspace: new device, reconnect, server restart, warm reload`, async ({ browser }) => {
  const server = new TestServer();
  const seeded = seedWorkspace(server.dataDir, layout);
  const results: { scenario: string; who: string; ms: number[] }[] = [];
  const record = (scenario: string, who: string, ms: number) => {
    let row = results.find((r) => r.scenario === scenario && r.who === who);
    if (!row) results.push((row = { scenario, who, ms: [] }));
    row.ms.push(Math.round(ms));
  };
  const facts: Record<string, string | number> = {};

  try {
    await timed(() => server.start(), (ms) => record("server start (catalog + indexes)", "server", ms));

    // What each person can open, as a Node device with no storage receives it (also their teamspaces
    // and databases' properties, which the web app doesn't open yet).
    const expected = {} as Record<Who, number>;
    for (const who of ["olive", "max", "gus"] as const) {
      const client = await connectAs(server, seeded.people[who]);
      const names = await timed(() => client.syncAll(), (ms) => record("Node device (no storage): sync everything", who, ms));
      await client.close();
      // The web app opens the person's index and every page it lists.
      expected[who] = names.filter((n) => n.startsWith("page:") || n.startsWith("index:")).length;
      facts[`documents ${who} can open (index + pages / all kinds)`] = `${expected[who]} / ${names.length}`;
    }
    facts["page documents in the workspace"] = seeded.pageCount;
    facts["documents in the workspace (pages, properties, teamspaces)"] = seeded.documentCount;

    // A new device per run: a fresh browser context with the person already picked, timed from
    // navigation until every document it can open has synced. The last one is kept.
    const devices = {} as Record<Who, Device>;
    for (const who of ["olive", "max", "gus"] as const) {
      for (let i = 0; i < REPEATS; i++) {
        const device = await openDevice(browser, server.url, seeded.people[who]);
        const t = await device.waitSynced(expected[who]);
        record("new device: download everything it can open", who, t.syncedMs);
        expect(device.closes(), "socket closed while syncing").toBe(0);
        if (i < REPEATS - 1) await device.context.close();
        else devices[who] = device;
      }
      facts[`JS heap, ${who}'s device with every document open (MB)`] = Math.round((await devices[who].heap()) / 1e6);
      await expectEveryDocConnected(server, seeded.people[who], expected[who]);
    }
    await devices.gus.context.close();
    const big = ["olive", "max"] as const;

    // Hocuspocus 4.7.1 can leave a device on a dead copy of a document unloaded while the device
    // opened it (#21): that device stops getting updates without any error. After each phase,
    // every document must be connected on the server, and a rename must reach both devices.
    let renames = 0;
    const expectStillLive = async () => {
      for (const who of big) await expectEveryDocConnected(server, seeded.people[who], expected[who]);
      const title = `Live check ${++renames}`;
      const writer = await connectAs(server, seeded.people.olive);
      try {
        await writer.open(`page:${seeded.engineeringPageId}`);
        await writer.rename(seeded.engineeringPageId, title);
        await writer.settled();
      } finally {
        await writer.close();
      }
      for (const who of big) {
        await expect
          .poll(() => devices[who].page.evaluate((id) => (window as any).__notesSync.get(`page:${id}`)?.doc.getMap("meta").get("title"), seeded.engineeringPageId), {
            message: `${who}'s device stopped receiving updates`,
          })
          .toBe(title);
      }
    };
    await expectStillLive();

    for (const who of big) {
      const d = devices[who];
      for (let i = 0; i < REPEATS; i++) {
        await d.context.setOffline(true);
        // At once: before the fix in `SyncManager.goOffline`, about 1 switch in 3 left the socket
        // closing for ~36 s, still "connected".
        await expect(d.page.getByTestId("sync-badge")).toHaveText(/Offline/, { timeout: 2_000 });
        await d.context.setOffline(false);
        const started = Date.now();
        await d.waitSynced(expected[who]);
        record("reconnect until everything re-synced", who, Date.now() - started);
      }
    }
    await expectStillLive();

    for (let i = 0; i < REPEATS; i++) {
      await server.stop();
      const started = Date.now();
      await timed(() => server.start(), (ms) => record("server start (catalog + indexes)", "server", ms));
      const done = await Promise.all(big.map(async (who) => {
        await devices[who].waitSynced(expected[who]);
        return Date.now() - started;
      }));
      big.forEach((who, j) => record("server restart until both devices re-synced", who, done[j]));
      record("server restart until both devices re-synced", "both", Math.max(...done));
      await expectStillLive();
    }

    for (const who of big) {
      const d = devices[who];
      for (let i = 0; i < REPEATS; i++) {
        const cdp = process.env.SCALE_PROFILE && who === "olive" && i === 0 ? await d.context.newCDPSession(d.page) : null;
        if (cdp) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.start"); }
        await d.page.reload();
        const t = await d.waitSynced(expected[who]);
        if (cdp) { const { profile } = await cdp.send("Profiler.stop"); writeFileSync(process.env.SCALE_PROFILE!, JSON.stringify(profile)); }
        record("warm reload: everything loaded from IndexedDB (sidebar complete)", who, t.localMs);
        record("warm reload until everything re-synced", who, t.syncedMs);
        expect(d.closes(), "socket closed while reloading").toBe(0);
      }
    }
    await expectStillLive();

    expect(await server.refusals(), "updates refused").toEqual([]);
    expect(server.logs.filter((l) => /closing connection/i.test(l)), "server dropped connections").toEqual([]);
  } finally {
    const report = format(results, facts);
    console.log(report);
    test.info().attach("scale-results", { body: report, contentType: "text/plain" });
    if (process.env.SCALE_RESULTS) writeFileSync(process.env.SCALE_RESULTS, JSON.stringify({ layout, repeats: REPEATS, results, facts }, null, 2));
    await server.stop();
  }
});

async function timed<T>(fn: () => Promise<T>, done: (ms: number) => void): Promise<T> {
  const started = performance.now();
  const value = await fn();
  done(performance.now() - started);
  return value;
}

interface Device {
  context: BrowserContext;
  page: Page;
  /**
   * Waits until every one of `total` documents is connected and synced with nothing pending.
   * Returns, in ms since the page's navigation started, when they had all loaded from IndexedDB
   * and when they had all synced.
   */
  waitSynced(total: number): Promise<{ localMs: number; syncedMs: number }>;
  /** How many times the device's socket closed since the page loaded. */
  closes(): Promise<number> | number;
  heap(): Promise<number>;
}

async function openDevice(browser: Browser, url: string, person: Person): Promise<Device> {
  const context = await browser.newContext();
  // The person is already picked, as on a device that has been set up: no picker in the timing.
  await context.addInitScript((p) => localStorage.setItem("notes-access.person", JSON.stringify(p)), person);
  const page = await context.newPage();
  await page.goto(url);
  let closeCount = 0;
  const device: Device = {
    context,
    page,
    async waitSynced(total) {
      await page.waitForFunction(() => (window as unknown as { __notesSync?: unknown }).__notesSync);
      const t = await page.evaluate(
        ({ total, timeout }) =>
          new Promise<{ localMs: number; syncedMs: number; closes: number }>((resolve, reject) => {
            const w = window as unknown as { __notesSync: any; __closes?: number };
            const m = w.__notesSync;
            if (w.__closes === undefined) {
              w.__closes = 0;
              m.socket.on("close", () => w.__closes!++);
            }
            const check = () => {
              const s = m.getSnapshot();
              if (s.connection === "connected" && s.total === total && s.synced === total && s.pendingChanges === 0) {
                off();
                clearTimeout(timer);
                // Each document stamps when it first loaded from IndexedDB and first synced (ms since
                // the sync manager started), so the times are exact even if this check ran late.
                const entries = [...m.entries.values()] as { localLoadedAt?: number; syncedAt?: number }[];
                const last = (key: "localLoadedAt" | "syncedAt") => m.startedAt + Math.max(...entries.map((e) => e[key] ?? 0));
                resolve({ localMs: last("localLoadedAt"), syncedMs: last("syncedAt"), closes: w.__closes! });
              }
            };
            const off = m.subscribe(check);
            const timer = setTimeout(() => {
              off();
              const pending = [...m.entries.values()]
                .filter((e: any) => e.unsyncedChanges > 0 || !e.synced)
                .slice(0, 5)
                .map((e: any) => ({
                  name: e.name, unsynced: e.unsyncedChanges, synced: e.synced,
                  authenticated: e.provider?.isAuthenticated, title: e.doc.getMap("meta").get("title"),
                }));
              reject(new Error(`not synced: ${JSON.stringify(m.getSnapshot())} ${JSON.stringify(pending)}`));
            }, timeout);
            check();
          }),
        { total, timeout: SYNC_TIMEOUT },
      );
      closeCount = t.closes;
      return t;
    },
    closes: () => closeCount,
    heap: () => page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0),
  };
  return device;
}

/** The server holds one open connection per document the device has (none dropped or refused). */
async function expectEveryDocConnected(server: TestServer, person: Person, total: number): Promise<void> {
  await expect
    .poll(async () => (await server.connections()).filter((c) => c.personId === person.id).length)
    .toBe(total);
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const sec = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

function format(results: { scenario: string; who: string; ms: number[] }[], facts: Record<string, string | number>): string {
  const lines = [`\nAccess scale results (${REPEATS} runs each; median, min–max):`];
  for (const r of results) {
    lines.push(`  ${r.scenario} [${r.who}]: ${sec(median(r.ms))} (${sec(Math.min(...r.ms))}–${sec(Math.max(...r.ms))}; ${r.ms.join(", ")} ms)`);
  }
  for (const [k, v] of Object.entries(facts)) lines.push(`  ${k}: ${v}`);
  return lines.join("\n");
}
