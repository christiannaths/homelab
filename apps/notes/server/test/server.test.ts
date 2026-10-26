import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, test } from "vitest";
import * as Y from "yjs";
import {
  device,
  MEMBER,
  OTHER_APPS_ADMIN,
  OWNER,
  request,
  start,
  tempDataDir,
  tryUpgrade,
  waitFor,
  type Account,
  type Device,
  type TestServer,
} from "./helpers.ts";
import { integer, text } from "../src/rows.ts";

const servers: TestServer[] = [];
const devices: Device[] = [];

afterEach(async () => {
  for (const d of devices.splice(0)) d.destroy();
  for (const s of servers.splice(0)) await s.close();
});

async function server(dataDir?: string, clientDir?: string) {
  const s = await start(dataDir, clientDir);
  servers.push(s);
  return s;
}

function track(d: Device) {
  devices.push(d);
  return d;
}

describe("the person the gateway signed in", () => {
  test("is a Notes owner with admin-level App access to Notes", async () => {
    const s = await server();
    const res = await request(s, "/api/session", OWNER);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      person: { id: "alex", role: "owner", name: "Alex" },
    });
  });

  test("is a member with member-level App access to Notes", async () => {
    const s = await server();
    expect(await (await request(s, "/api/session", MEMBER)).json()).toEqual({
      person: { id: "sam", role: "member", name: "Sam" },
    });
  });

  test("is a member as another app's admin, with no name when the gateway sends none", async () => {
    const s = await server();
    expect(
      await (await request(s, "/api/session", OTHER_APPS_ADMIN)).json(),
    ).toEqual({ person: { id: "kim", role: "member", name: null } });
  });

  test("keeps their name and role in step with the accounts service", async () => {
    const s = await server();
    await request(s, "/api/session", OWNER);
    const renamed: Account = {
      ...OWNER,
      name: "Zoë Ångström",
      access: { notes: "member" },
    };
    expect(await (await request(s, "/api/session", renamed)).json()).toEqual({
      person: { id: "alex", role: "member", name: "Zoë Ångström" },
    });
    const row = s.db.prepare("SELECT role, name FROM people").get() ?? {};
    expect([text(row, "role"), text(row, "name")]).toEqual([
      "member",
      "Zoë Ångström",
    ]);
  });

  test("is nobody on a request that did not come through the gateway", async () => {
    const s = await server();
    const res = await request(s, "/api/session");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "signed_out" });
    expect(await tryUpgrade(s)).toBe(401);
  });
});

describe("signing in and out", () => {
  test("signing in returns to the app, since the gateway has already signed the browser in", async () => {
    const s = await server();
    const res = await request(s, "/api/sign-in", OWNER);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
  });

  test("has no sign-out of its own: the App switcher signs out of every app", async () => {
    const s = await server();
    expect((await request(s, "/api/sign-out", OWNER)).status).toBe(404);
  });
});

describe("sync", () => {
  test("an upgrade that did not come through the gateway is refused", async () => {
    const s = await server();
    expect(await tryUpgrade(s)).toBe(401);
    expect(await tryUpgrade(s, OWNER)).toBe("open");
  });

  test("until the access rules exist, a member opens no documents", async () => {
    const s = await server();
    const page = track(device(s, MEMBER)).open("pages/plan");
    expect(await page.denied).toBeTruthy();
  });

  test("two devices co-edit a page, and it survives a server restart", async () => {
    let s = await server();
    const a = track(device(s, OWNER)).open("pages/plan");
    const b = track(device(s, OWNER)).open("pages/plan");
    await Promise.all([a.synced, b.synced]);
    a.doc.getText("body").insert(0, "hello from the phone");
    await waitFor(
      () => b.doc.getText("body").toString() === "hello from the phone",
    );

    for (const d of devices.splice(0)) d.destroy();
    const { dataDir } = s;
    await servers.pop()!.close();
    s = await server(dataDir);

    const c = track(device(s, OWNER)).open("pages/plan");
    await c.synced;
    expect(c.doc.getText("body").toString()).toBe("hello from the phone");
  });

  test("one socket carries many documents", async () => {
    const s = await server();
    const d = track(device(s, OWNER));
    await Promise.all(
      Array.from({ length: 300 }, (_, i) => d.open(`pages/page-${i}`).synced),
    );
  });

  test("edits made offline sync after reconnecting", async () => {
    const s = await server();
    const first = track(device(s, OWNER));
    const before = first.open("pages/plan");
    await before.synced;
    const offlineState = Y.encodeStateAsUpdate(before.doc);
    first.destroy();

    const local = new Y.Doc();
    Y.applyUpdate(local, offlineState);
    local.getText("body").insert(0, "written offline");

    const after = track(device(s, OWNER)).open("pages/plan");
    Y.applyUpdate(after.doc, Y.encodeStateAsUpdate(local));
    await after.synced;
    await waitFor(
      () =>
        s.hocuspocus.documents.get("pages/plan")?.getText("body").toString() ===
        "written offline",
    );
  });
});

describe("storage", () => {
  test("health answers, and people are kept across a restart", async () => {
    const s = await server();
    expect(await (await request(s, "/api/health")).json()).toEqual({
      ok: true,
    });
    await request(s, "/api/session", OWNER);
    const versionRow = s.db.prepare("PRAGMA user_version").get() ?? {};
    expect(integer(versionRow, "user_version")).toBe(2);

    const { dataDir } = s;
    await servers.pop()!.close();
    const again = await server(dataDir);
    const ids = again.db
      .prepare("SELECT id FROM people")
      .all()
      .map((row) => text(row, "id"));
    expect(ids).toEqual(["alex"]);
  });

  test("an instance from before the gateway loses its sessions and the people keyed by sub", async () => {
    const dataDir = tempDataDir();
    const old = new DatabaseSync(path.join(dataDir, "notes.sqlite"));
    old.exec(`
      CREATE TABLE documents (name TEXT PRIMARY KEY, state BLOB NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE people (id TEXT PRIMARY KEY, role TEXT NOT NULL, name TEXT, created_at INTEGER NOT NULL);
      CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, person_id TEXT NOT NULL, created_at INTEGER NOT NULL,
        renewed_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
      INSERT INTO documents VALUES ('pages/plan', x'00', 1);
      INSERT INTO people VALUES ('0b8c-sub', 'owner', 'Alex', 1);
      INSERT INTO sessions VALUES ('hash', '0b8c-sub', 1, 1, 2);
      PRAGMA user_version = 1;
    `);
    old.close();

    const s = await server(dataDir);
    const tables = s.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => text(row, "name"));
    expect(tables).not.toContain("sessions");
    expect(s.db.prepare("SELECT id FROM people").all()).toEqual([]);
    expect(s.db.prepare("SELECT name FROM documents").all()).toHaveLength(1);
  });
});

describe("the web client", () => {
  /** A stand-in for the client's build: an app shell and one asset. */
  function builtClient() {
    const dir = tempDataDir();
    writeFileSync(path.join(dir, "index.html"), "<title>Notes</title>");
    mkdirSync(path.join(dir, "assets"));
    writeFileSync(path.join(dir, "assets", "app.js"), "console.log(1)");
    return dir;
  }

  test("is served, with the app shell for client-side routes but not for the API or sync", async () => {
    const s = await server(undefined, builtClient());
    const shell = await request(s, "/", OWNER);
    expect(shell.headers.get("content-type")).toMatch(/text\/html/);
    expect(await shell.text()).toBe("<title>Notes</title>");
    expect(await (await request(s, "/assets/app.js")).text()).toBe(
      "console.log(1)",
    );
    expect(await (await request(s, "/pages/plan")).text()).toBe(
      "<title>Notes</title>",
    );

    const unknownApi = await request(s, "/api/nothing-here");
    expect(unknownApi.status).toBe(404);
    expect(await unknownApi.json()).toEqual({ error: "not_found" });
    expect((await request(s, "/sync")).status).toBe(401);
    expect((await request(s, "/sync/more")).status).toBe(404);
  });
});
