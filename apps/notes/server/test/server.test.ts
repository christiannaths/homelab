import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import * as Y from "yjs";
import {
  callback,
  DAY_MS,
  device,
  OTHER_ADMIN,
  OWNER,
  signIn,
  start,
  STRANGER,
  tryUpgrade,
  waitFor,
  type Device,
  type TestServer,
} from "./helpers.ts";
import { integer, text } from "../src/rows.ts";
import { StandInVoidAuth } from "./stand-in-voidauth.ts";

const voidauth = new StandInVoidAuth();
const servers: TestServer[] = [];
const devices: Device[] = [];

beforeAll(() => voidauth.start());
afterAll(() => voidauth.stop());
afterEach(async () => {
  voidauth.tamper = undefined;
  for (const d of devices.splice(0)) d.destroy();
  for (const s of servers.splice(0)) await s.close();
});

async function server(dataDir?: string) {
  const s = await start(voidauth, dataDir);
  servers.push(s);
  return s;
}

function track(d: Device) {
  devices.push(d);
  return d;
}

/** A server whose owner has signed in once; returns that device's cookie. */
async function withOwner() {
  const s = await server();
  const { cookie } = await signIn(s, voidauth, OWNER);
  return { s, cookie: cookie! };
}

describe("signing in through VoidAuth", () => {
  test("the first VoidAuth admin to sign in becomes the owner", async () => {
    const s = await server();
    const result = await signIn(s, voidauth, OWNER);
    expect(result.status).toBe(302);
    expect(result.body).toBe("/");
    const session = await fetch(`${s.url}/api/session`, {
      headers: { cookie: result.cookie! },
    });
    expect(await session.json()).toEqual({
      person: { id: OWNER.sub, role: "owner", name: "Alex" },
    });
  });

  test("someone who is not a VoidAuth admin cannot become the first owner", async () => {
    const s = await server();
    const result = await signIn(s, voidauth, STRANGER);
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ error: "not_a_member" });
    expect(result.cookie).toBeUndefined();
  });

  test("once there is an owner, a VoidAuth account admits nobody else, admin or not", async () => {
    const { s } = await withOwner();
    expect((await signIn(s, voidauth, OTHER_ADMIN)).status).toBe(403);
    expect((await signIn(s, voidauth, STRANGER)).status).toBe(403);
  });

  test("the owner signs in again on another device, and the name follows VoidAuth", async () => {
    const { s } = await withOwner();
    const laptop = await signIn(s, voidauth, { ...OWNER, name: "Alex K" });
    expect(laptop.status).toBe(302);
    const session = await fetch(`${s.url}/api/session`, {
      headers: { cookie: laptop.cookie! },
    });
    expect(await session.json()).toEqual({
      person: { id: OWNER.sub, role: "owner", name: "Alex K" },
    });
  });

  test("a callback that does not match the sign-in it started is refused", async () => {
    const s = await server();
    voidauth.account = OWNER;
    const started = await fetch(`${s.url}/api/sign-in`, { redirect: "manual" });
    const pending = started.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const location = new URL(
      (
        await fetch(started.headers.get("location")!, { redirect: "manual" })
      ).headers.get("location")!,
    );

    const forgedState = new URL(location);
    forgedState.searchParams.set("state", "forged");
    expect((await callback(s, forgedState.href, pending)).status).toBe(400);
    // Without the sign-in cookie, as when someone else's callback link is opened.
    expect((await callback(s, location.href, "")).status).toBe(400);
  });

  test("an ID token for another sign-in is refused", async () => {
    const s = await server();
    voidauth.tamper = (claims) => ({ ...claims, nonce: "replayed" });
    const result = await signIn(s, voidauth, OWNER);
    expect(result.status).toBe(400);
    expect(result.cookie).toBeUndefined();
  });

  test("VoidAuth refusing the sign-in is reported, and nobody is signed in", async () => {
    const s = await server();
    const result = await signIn(s, voidauth, undefined);
    expect(result.status).toBe(400);
    expect(result.cookie).toBeUndefined();
  });
});

describe("device sessions", () => {
  test("the session cookie lasts a year and cannot be read by scripts", async () => {
    const s = await server();
    const { setCookie } = await signIn(s, voidauth, OWNER);
    const session = setCookie.find((c) => c.startsWith("notes_session="))!;
    expect(session).toMatch(/Max-Age=31536000/);
    expect(session).toMatch(/HttpOnly/);
    expect(session).toMatch(/Secure/);
    expect(session).toMatch(/SameSite=Lax/);
  });

  test("the session token is not stored as is", async () => {
    const { s, cookie } = await withOwner();
    const token = cookie.split("=")[1];
    const hashes = s.db
      .prepare("SELECT token_hash FROM sessions")
      .all()
      .map((row) => text(row, "token_hash"));
    expect(hashes).toHaveLength(1);
    expect(hashes[0]).not.toBe(token);
  });

  test("a device unused for 200 days still syncs, and using it extends the session a year again", async () => {
    const { s, cookie } = await withOwner();
    s.advance(200 * DAY_MS);
    expect(await tryUpgrade(s, cookie)).toBe("open");
    s.advance(300 * DAY_MS);
    expect(await tryUpgrade(s, cookie)).toBe("open");
  });

  test("a device unused for over a year is signed out", async () => {
    const { s, cookie } = await withOwner();
    s.advance(366 * DAY_MS);
    expect(await tryUpgrade(s, cookie)).toBe(401);
    expect(
      (await fetch(`${s.url}/api/session`, { headers: { cookie } })).status,
    ).toBe(401);
  });

  test("the session check renews the cookie for another year", async () => {
    const { s, cookie } = await withOwner();
    const res = await fetch(`${s.url}/api/session`, { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBe(
      `${cookie}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000`,
    );
  });

  test("devices keep syncing while VoidAuth is down", async () => {
    const { s, cookie } = await withOwner();
    await voidauth.stop();
    try {
      const d = track(device(s, cookie));
      await d.open("pages/plan").synced;
      expect(
        (await fetch(`${s.url}/api/session`, { headers: { cookie } })).status,
      ).toBe(200);
    } finally {
      await voidauth.start();
    }
  });
});

test("a sign-in while VoidAuth is unreachable is reported as unavailable", async () => {
  const down = new StandInVoidAuth();
  await down.start();
  await down.stop();
  const s = await start(down);
  servers.push(s);
  const res = await fetch(`${s.url}/api/sign-in`, { redirect: "manual" });
  expect(res.status).toBe(502);
  expect(await res.json()).toEqual({ error: "sign_in_unavailable" });
});

describe("sync", () => {
  test("no cookie, or a forged one, is refused before the upgrade", async () => {
    const { s } = await withOwner();
    expect(await tryUpgrade(s)).toBe(401);
    expect(await tryUpgrade(s, "notes_session=forged")).toBe(401);
  });

  test("two devices co-edit a page, and it survives a server restart", async () => {
    let { s, cookie } = await withOwner();
    const laptop = (await signIn(s, voidauth, OWNER)).cookie!;

    const a = track(device(s, cookie)).open("pages/plan");
    const b = track(device(s, laptop)).open("pages/plan");
    await Promise.all([a.synced, b.synced]);
    a.doc.getText("body").insert(0, "hello from the phone");
    await waitFor(
      () => b.doc.getText("body").toString() === "hello from the phone",
    );

    for (const d of devices.splice(0)) d.destroy();
    const { dataDir } = s;
    await servers.pop()!.close();
    s = await server(dataDir);

    const c = track(device(s, laptop)).open("pages/plan");
    await c.synced;
    expect(c.doc.getText("body").toString()).toBe("hello from the phone");
  });

  test("one socket carries many documents", async () => {
    const { s, cookie } = await withOwner();
    const d = track(device(s, cookie));
    await Promise.all(
      Array.from({ length: 300 }, (_, i) => d.open(`pages/page-${i}`).synced),
    );
  });

  test("edits made offline sync after reconnecting with the same session", async () => {
    const { s, cookie } = await withOwner();
    const first = track(device(s, cookie));
    const before = first.open("pages/plan");
    await before.synced;
    const offlineState = Y.encodeStateAsUpdate(before.doc);
    first.destroy();

    const local = new Y.Doc();
    Y.applyUpdate(local, offlineState);
    local.getText("body").insert(0, "written offline");

    const after = track(device(s, cookie)).open("pages/plan");
    Y.applyUpdate(after.doc, Y.encodeStateAsUpdate(local));
    await after.synced;
    await waitFor(
      () =>
        s.hocuspocus.documents.get("pages/plan")?.getText("body").toString() ===
        "written offline",
    );
  });
});

describe("signing out", () => {
  test("closes that device's socket at once, but not the person's other devices", async () => {
    const { s, cookie } = await withOwner();
    const laptop = (await signIn(s, voidauth, OWNER)).cookie!;
    const phone = track(device(s, cookie));
    const other = track(device(s, laptop));
    await phone.open("pages/plan").synced;
    await other.open("pages/plan").synced;

    const res = await fetch(`${s.url}/api/sign-out`, {
      method: "POST",
      headers: { cookie },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toMatch(
      /^notes_session=; .*Max-Age=0/,
    );
    expect(await phone.closed).toBe(4401);
    expect(await tryUpgrade(s, cookie)).toBe(401);
    expect(await tryUpgrade(s, laptop)).toBe("open");
  });
});

describe("storage", () => {
  test("health answers, and the schema is created once and reopened", async () => {
    const { s } = await withOwner();
    expect(await (await fetch(`${s.url}/api/health`)).json()).toEqual({
      ok: true,
    });
    const versionRow = s.db.prepare("PRAGMA user_version").get() ?? {};
    expect(integer(versionRow, "user_version")).toBe(1);

    const { dataDir } = s;
    await servers.pop()!.close();
    const again = await server(dataDir);
    // The owner is still there after a restart, so nobody else can take over.
    expect((await signIn(again, voidauth, OTHER_ADMIN)).status).toBe(403);
    expect((await signIn(again, voidauth, OWNER)).status).toBe(302);
  });
});
