import { afterEach, describe, expect, test } from "vitest";
import * as Y from "yjs";
import {
  createMember, device, post, setUpAdmin, signIn, start, tryUpgrade, waitFor,
  type Device, type TestServer,
} from "./helpers.ts";

const DAY_MS = 24 * 3600 * 1000;
const servers: TestServer[] = [];
const devices: Device[] = [];

async function server(dataDir?: string) {
  const s = await start(dataDir);
  servers.push(s);
  return s;
}

function track(d: Device) {
  devices.push(d);
  return d;
}

afterEach(async () => {
  for (const d of devices.splice(0)) d.destroy();
  for (const s of servers.splice(0)) await s.close();
});

describe("1. Hono serves the PWA and the API", () => {
  test("health, static files and the client-side route fallback", async () => {
    const s = await server();
    expect(await (await fetch(`${s.url}/api/health`)).json()).toEqual({ ok: true, documents: 0 });
    const page = await fetch(`${s.url}/index.html`);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(await (await fetch(`${s.url}/page/some-id`)).text()).toContain("Stand-in for the Notes PWA");
  });

  test("first-run setup creates the admin once, then is refused", async () => {
    const s = await server();
    const { body } = await setUpAdmin(s);
    expect(body.user.role).toBe("admin");
    expect((await post(s, "/api/setup", { username: "mallory", password: "x".repeat(12) })).status).toBe(409);
  });

  test("there is no public sign-up", async () => {
    const s = await server();
    await setUpAdmin(s);
    const res = await post(s, "/api/auth/sign-up/email", {
      email: "mallory@example.com", password: "x".repeat(12), name: "mallory",
    });
    expect(res.ok).toBe(false);
  });

  test("only an admin can create accounts", async () => {
    const s = await server();
    const admin = await setUpAdmin(s);
    const member = await createMember(s, admin.cookie, "sam");
    const res = await post(
      s, "/api/auth/admin/create-user",
      { email: "eve@users.invalid", password: "x".repeat(12), name: "eve" },
      member.cookie,
    );
    expect(res.status).toBe(403);
  });

  test("repeated failed sign-ins are rate limited", async () => {
    const s = await server();
    await setUpAdmin(s);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await post(s, "/api/auth/sign-in/username", { username: "admin", password: "wrong" })).status);
    }
    expect(statuses).toContain(429);
  });
});

describe("2. Hocuspocus runs behind Hono through handleConnection", () => {
  test("two people co-edit a doc, and it survives a server restart", async () => {
    let s = await server();
    const admin = await setUpAdmin(s);
    const sam = await createMember(s, admin.cookie, "sam");

    const a = track(device(s, admin.cookie)).open("shared/plan");
    const b = track(device(s, sam.cookie)).open("shared/plan");
    await Promise.all([a.synced, b.synced]);
    a.doc.getText("body").insert(0, "hello from admin");
    await waitFor(() => b.doc.getText("body").toString() === "hello from admin");

    for (const d of devices.splice(0)) d.destroy();
    const { dataDir } = s;
    await servers.pop()!.close();
    s = await server(dataDir);

    const c = track(device(s, sam.cookie)).open("shared/plan");
    await c.synced;
    expect(c.doc.getText("body").toString()).toBe("hello from admin");
  });

  test("one socket carries many documents", async () => {
    const s = await server();
    const admin = await setUpAdmin(s);
    const d = track(device(s, admin.cookie));
    const docs = Array.from({ length: 300 }, (_, i) => d.open(`shared/page-${i}`));
    await Promise.all(docs.map((x) => x.synced));
  });
});

describe("3. A Better Auth session cookie authenticates the sync socket", () => {
  test("no cookie, or a forged one, is refused before the upgrade", async () => {
    const s = await server();
    await setUpAdmin(s);
    expect(await tryUpgrade(s)).toBe(401);
    expect(await tryUpgrade(s, "better-auth.session_token=forged.value")).toBe(401);
  });

  test("access is decided per document on the same socket", async () => {
    const s = await server();
    const admin = await setUpAdmin(s);
    const sam = await createMember(s, admin.cookie, "sam");
    const samId = sam.body.user.id;

    const samDevice = track(device(s, sam.cookie));
    await samDevice.open(`private/${samId}/journal`).synced;
    await samDevice.open("shared/plan").synced;

    const adminDevice = track(device(s, admin.cookie));
    expect(await adminDevice.open(`private/${samId}/journal`).denied).toBeTruthy();
    // The socket stays usable for the documents admin may open.
    await adminDevice.open("shared/other").synced;
  });

  test("a read-only document accepts no edits from a viewer", async () => {
    const s = await server();
    const admin = await setUpAdmin(s);
    const sam = await createMember(s, admin.cookie, "sam");

    const editor = track(device(s, admin.cookie)).open("readonly/house-manual");
    const viewer = track(device(s, sam.cookie)).open("readonly/house-manual");
    await Promise.all([editor.synced, viewer.synced]);
    // The device is told, so the UI can turn editing off (ADR 13).
    expect(viewer.provider.authorizedScope).toBe("readonly");
    expect(editor.provider.authorizedScope).toBe("read-write");

    editor.doc.getText("body").insert(0, "Bedtime is 8pm.");
    await waitFor(() => viewer.doc.getText("body").toString() === "Bedtime is 8pm.");

    viewer.doc.getText("body").insert(0, "Bedtime is never. ");
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(editor.doc.getText("body").toString()).toBe("Bedtime is 8pm.");
    const onServer = s.hocuspocus.documents.get("readonly/house-manual")!;
    expect(onServer.getText("body").toString()).toBe("Bedtime is 8pm.");
    // The server drops the viewer's edit silently: it stays in the viewer's local copy.
    expect(viewer.doc.getText("body").toString()).toBe("Bedtime is never. Bedtime is 8pm.");
  });
});

describe("4. Long-lived sessions, and revocation stops syncing", () => {
  test("the session cookie lasts a year", async () => {
    const s = await server();
    const { setCookie } = await setUpAdmin(s);
    expect(setCookie).toMatch(/Max-Age=31536000/);
    expect(setCookie).toMatch(/HttpOnly/);
  });

  test("a device that has not synced for months can still connect", async () => {
    const s = await server();
    const admin = await setUpAdmin(s);
    // Simulate 200 days offline: the session was last extended 200 days ago, so it
    // has 165 days left. Better Auth stores dates as ISO strings.
    const iso = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();
    s.db.prepare(`UPDATE session SET expiresAt = ?, updatedAt = ?`).run(iso(165), iso(-200));
    expect(await tryUpgrade(s, admin.cookie)).toBe("open");
    // Connecting extends the session (updateAge is a day), so active devices never expire.
    const { expiresAt } = s.db.prepare(`SELECT expiresAt FROM session`).get() as { expiresAt: string };
    expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now() + 360 * DAY_MS);
  });

  test("an HTTP session check renews the cookie for another year", async () => {
    const s = await server();
    const admin = await setUpAdmin(s);
    const iso = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();
    s.db.prepare(`UPDATE session SET expiresAt = ?`).run(iso(165));
    const res = await fetch(`${s.url}/api/auth/get-session`, { headers: { cookie: admin.cookie } });
    expect(res.ok).toBe(true);
    expect(res.headers.get("set-cookie")).toMatch(/Max-Age=31536000/);
  });

  test("an expired session is refused", async () => {
    const s = await server();
    const admin = await setUpAdmin(s);
    s.db.prepare(`UPDATE session SET expiresAt = ?`).run(new Date(Date.now() - 1000).toISOString());
    expect(await tryUpgrade(s, admin.cookie)).toBe(401);
  });

  test("an admin revoking a person's sessions closes their open socket and blocks reconnecting", async () => {
    const s = await server();
    const admin = await setUpAdmin(s);
    const sam = await createMember(s, admin.cookie, "sam");
    const samDevice = track(device(s, sam.cookie));
    await samDevice.open("shared/plan").synced;

    const res = await post(s, "/api/auth/admin/revoke-user-sessions", { userId: sam.body.user.id }, admin.cookie);
    expect(res.ok).toBe(true);
    expect(await samDevice.closed).toBe(4401);
    expect(await tryUpgrade(s, sam.cookie)).toBe(401);
  });

  test("signing out closes that device's socket but not the person's other devices", async () => {
    const s = await server();
    const admin = await setUpAdmin(s);
    const laptop = await signIn(s, "admin");

    const phoneDevice = track(device(s, admin.cookie));
    const laptopDevice = track(device(s, laptop.cookie));
    await phoneDevice.open("shared/plan").synced;
    await laptopDevice.open("shared/plan").synced;

    expect((await post(s, "/api/auth/sign-out", {}, admin.cookie)).ok).toBe(true);
    expect(await phoneDevice.closed).toBe(4401);
    expect(await tryUpgrade(s, laptop.cookie)).toBe("open");
  });

  test("edits made offline sync after reconnecting with the same session", async () => {
    const s = await server();
    const admin = await setUpAdmin(s);
    const first = track(device(s, admin.cookie));
    const before = first.open("shared/plan");
    await before.synced;
    const offlineState = Y.encodeStateAsUpdate(before.doc);
    first.destroy();

    // The device edits its local copy with no connection, then reconnects later.
    const local = new Y.Doc();
    Y.applyUpdate(local, offlineState);
    local.getText("body").insert(0, "written offline");

    const again = track(device(s, admin.cookie));
    const after = again.open("shared/plan");
    Y.applyUpdate(after.doc, Y.encodeStateAsUpdate(local));
    await after.synced;
    await waitFor(() => s.hocuspocus.documents.get("shared/plan")?.getText("body").toString() === "written offline");
  });
});
