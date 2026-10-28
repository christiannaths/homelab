import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, test } from "vitest";
import * as Y from "yjs";
import {
  device,
  indexedPages,
  indexedWorkspaces,
  pageId,
  writePage,
  SAM,
  KIM,
  ALEX,
  request,
  openNotes,
  start,
  tempDataDir,
  tryUpgrade,
  waitFor,
  workspaceName,
  type Account,
  type Device,
  type TestServer,
} from "./helpers.ts";
import {
  applyPagePatch,
  pageContent,
  readPage,
  setWorkspaceName,
  writeIndex,
} from "@homelab/notes-model";
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

/** A new device of `account`'s, with Notes open on it. */
const signedIn = (s: TestServer, account: Account) =>
  openNotes(s, track(device(s, account)), account);

/** Stops `s` and starts it again on the same data, as after a deploy. */
async function restart(s: TestServer): Promise<TestServer> {
  for (const d of devices.splice(0)) d.destroy();
  servers.splice(servers.indexOf(s), 1);
  await s.close();
  return server(s.dataDir);
}

/** The page called `id` as the server holds it, or null if it has none. */
function storedPage(s: TestServer, id: string) {
  const doc = s.hocuspocus.documents.get(`page:${id}`);
  return doc ? readPage(id, doc) : null;
}

/** A top-level page `account` adds to their Private section on `d`, once their index lists it. */
async function addPage(
  notes: Awaited<ReturnType<typeof openNotes>>,
  d: Device,
  account: Account,
) {
  const id = pageId();
  const opened = d.open(`page:${id}`);
  writePage(opened.doc, {
    id,
    workspaceId: notes.workspaceId,
    creatorId: account.id,
  });
  await opened.synced;
  await waitFor(() => indexedPages(notes.index.doc)[id] === "full");
  return { id, ...opened };
}

describe("the person the gateway signed in", () => {
  test("is told who they are, whatever their level of App access to Notes", async () => {
    const s = await server();
    const res = await request(s, "/api/session", ALEX);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ person: { id: "alex", name: "Alex" } });
    expect(await (await request(s, "/api/session", SAM)).json()).toEqual({
      person: { id: "sam", name: "Sam" },
    });
  });

  test("has no name when the gateway sends none", async () => {
    const s = await server();
    expect(await (await request(s, "/api/session", KIM)).json()).toEqual({
      person: { id: "kim", name: null },
    });
  });

  test("keeps their name in step with the accounts service", async () => {
    const s = await server();
    await request(s, "/api/session", ALEX);
    const renamed: Account = { ...ALEX, name: "Zoë Ångström" };
    expect(await (await request(s, "/api/session", renamed)).json()).toEqual({
      person: { id: "alex", name: "Zoë Ångström" },
    });
    const row = s.db.prepare("SELECT name FROM people").get() ?? {};
    expect(text(row, "name")).toBe("Zoë Ångström");
  });

  test("is nobody on a request that did not come through the gateway", async () => {
    const s = await server();
    const res = await request(s, "/api/session");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "signed_out" });
    expect(await tryUpgrade(s)).toBe(401);
  });
});

describe("the default workspace", () => {
  test("is made on a person's first admission, named after them, with them as its owner", async () => {
    const s = await server();
    const { index, workspace, workspaceId } = await signedIn(s, ALEX);
    expect(indexedWorkspaces(index.doc)).toEqual([workspaceId]);
    expect(
      s.db.prepare("SELECT person_id, role FROM workspace_members").all(),
    ).toEqual([{ person_id: "alex", role: "owner" }]);
    expect(workspaceName(workspace.doc)).toBe("Alex's workspace");
  });

  test("is made whatever the level of App access to Notes, and is called My workspace without a name", async () => {
    const s = await server();
    const sam = await signedIn(s, SAM);
    expect(indexedWorkspaces(sam.index.doc)).toEqual([sam.workspaceId]);
    expect(workspaceName(sam.workspace.doc)).toBe("Sam's workspace");
    const kim = await signedIn(s, KIM);
    expect(workspaceName(kim.workspace.doc)).toBe("My workspace");
  });

  test("is made once, however many times and devices the person opens Notes with", async () => {
    const s = await server();
    await Promise.all([
      request(s, "/api/session", ALEX),
      request(s, "/api/session", ALEX),
    ]);
    const phone = await signedIn(s, ALEX);
    const laptop = await signedIn(s, ALEX);
    expect(indexedWorkspaces(laptop.index.doc)).toEqual([phone.workspaceId]);
  });

  test("is made when a device opens sync before asking who is signed in", async () => {
    const s = await server();
    const index = track(device(s, ALEX)).open(`index:${ALEX.id}`);
    await index.synced;
    await waitFor(() => indexedWorkspaces(index.doc).length === 1);
  });

  test("and the index survive a server restart", async () => {
    let s = await server();
    const before = await signedIn(s, ALEX);
    for (const d of devices.splice(0)) d.destroy();
    const { dataDir } = s;
    await servers.pop()!.close();
    s = await server(dataDir);

    const after = await signedIn(s, ALEX);
    expect(after.workspaceId).toBe(before.workspaceId);
    expect(indexedWorkspaces(after.index.doc)).toEqual([before.workspaceId]);
    expect(workspaceName(after.workspace.doc)).toBe("Alex's workspace");
  });
});

describe("pages", () => {
  test("the default workspace starts with one empty page in Private, at Full access", async () => {
    const s = await server();
    const { index, workspaceId } = await signedIn(s, ALEX);
    const pages = Object.entries(indexedPages(index.doc));
    expect(pages).toEqual([[expect.any(String), "full"]]);
    const [id] = pages[0];
    const first = track(device(s, ALEX)).open(`page:${id}`);
    await first.synced;
    expect(readPage(id, first.doc)).toMatchObject({
      workspaceId,
      title: "",
      parentId: null,
      section: "private",
      deletedAt: null,
      access: { people: { alex: "full" } },
    });
  });

  test("a page a person adds is listed in their index and reaches their other devices live, and nobody else's", async () => {
    const s = await server();
    const phoneDevice = track(device(s, ALEX));
    const phone = await openNotes(s, phoneDevice, ALEX);
    const page = await addPage(phone, phoneDevice, ALEX);
    applyPagePatch(page.doc, { title: "Groceries" });

    const laptop = await signedIn(s, ALEX);
    expect(indexedPages(laptop.index.doc)[page.id]).toBe("full");
    const onLaptop = track(device(s, ALEX)).open(`page:${page.id}`);
    await onLaptop.synced;
    await waitFor(() => readPage(page.id, onLaptop.doc)?.title === "Groceries");

    pageContent(page.doc).insert(0, [new Y.XmlText("Milk")]);
    await waitFor(() => pageContent(onLaptop.doc).toString().includes("Milk"));

    const samsDevice = track(device(s, SAM));
    const sam = await openNotes(s, samsDevice, SAM);
    expect(indexedPages(sam.index.doc)[page.id]).toBeUndefined();
    const refused = samsDevice.open(`page:${page.id}`);
    expect(await refused.denied).toBe("no-access");
    expect(readPage(page.id, refused.doc)).toBeNull();
  });

  test("survive a restart, and are still refused to anyone else", async () => {
    let s = await server();
    const d = track(device(s, ALEX));
    const notes = await openNotes(s, d, ALEX);
    const page = await addPage(notes, d, ALEX);
    applyPagePatch(page.doc, { title: "Kept" });
    await waitFor(() => storedPage(s, page.id)?.title === "Kept");
    await signedIn(s, SAM);

    s = await restart(s);
    const again = await signedIn(s, ALEX);
    expect(indexedPages(again.index.doc)[page.id]).toBe("full");
    const reopened = track(device(s, ALEX)).open(`page:${page.id}`);
    await reopened.synced;
    expect(readPage(page.id, reopened.doc)?.title).toBe("Kept");
    const sams = track(device(s, SAM)).open(`page:${page.id}`);
    expect(await sams.denied).toBe("no-access");
  });

  test("one socket carries hundreds of pages", async () => {
    const s = await server();
    const d = track(device(s, ALEX));
    const notes = await openNotes(s, d, ALEX);
    await Promise.all(
      Array.from({ length: 300 }, () => {
        const id = pageId();
        const opened = d.open(`page:${id}`);
        writePage(opened.doc, {
          id,
          workspaceId: notes.workspaceId,
          creatorId: ALEX.id,
        });
        return opened.synced;
      }),
    );
    await waitFor(
      () => Object.keys(indexedPages(notes.index.doc)).length === 301,
    );
  });
});

describe("a page update", () => {
  /** Alex's page and the device holding it, with Sam signed in too. */
  async function alexsPage() {
    const s = await server();
    const d = track(device(s, ALEX));
    const notes = await openNotes(s, d, ALEX);
    const page = await addPage(notes, d, ALEX);
    const sam = await signedIn(s, SAM);
    return { s, d, notes, page, sam };
  }

  test("giving an access entry to someone outside the workspace is refused", async () => {
    const { s, page } = await alexsPage();
    applyPagePatch(page.doc, { access: { people: { sam: "view" } } });
    expect(await page.closed).toBe("access-change-refused");
    expect(storedPage(s, page.id)?.access.people).toEqual({ alex: "full" });
  });

  test("changing the page's workspace is refused", async () => {
    const { s, page, sam } = await alexsPage();
    page.doc.getMap("meta").set("workspaceId", sam.workspaceId);
    expect(await page.closed).toBe("placement-refused");
    expect(storedPage(s, page.id)?.workspaceId).not.toBe(sam.workspaceId);
  });

  test("adding a page to someone else's workspace, or under their page, is refused", async () => {
    const { s, notes, page } = await alexsPage();
    const samsDevice = track(device(s, SAM));
    for (const fields of [{}, { parentId: page.id, access: { people: {} } }]) {
      const id = pageId();
      const opened = samsDevice.open(`page:${id}`);
      writePage(
        opened.doc,
        { id, workspaceId: notes.workspaceId, creatorId: SAM.id },
        fields,
      );
      expect(await opened.closed).toBe("placement-refused");
      expect(storedPage(s, id)).toBeNull();
    }
    expect(Object.keys(indexedPages(notes.index.doc))).toHaveLength(2);
  });

  test("adding a page outside the Private section is refused", async () => {
    const { s, notes, d } = await alexsPage();
    const id = pageId();
    const opened = d.open(`page:${id}`);
    writePage(
      opened.doc,
      { id, workspaceId: notes.workspaceId, creatorId: ALEX.id },
      { section: "someone-elses-teamspace" },
    );
    expect(await opened.closed).toBe("placement-refused");
    expect(storedPage(s, id)).toBeNull();
  });

  test("changing access below Full access is refused, while edits at Can edit apply", async () => {
    let s = await server();
    const notes = await signedIn(s, ALEX);
    await signedIn(s, SAM);
    // Adding workspace members comes later (spec #130); here Sam joins Alex's workspace in storage.
    s.db
      .prepare(
        `INSERT INTO workspace_members (workspace_id, person_id, role, created_at)
         VALUES (?, 'sam', 'member', 0)`,
      )
      .run(notes.workspaceId);
    s = await restart(s);

    const alexsDevice = track(device(s, ALEX));
    const alex = await openNotes(s, alexsDevice, ALEX);
    const id = pageId();
    const shared = alexsDevice.open(`page:${id}`);
    writePage(
      shared.doc,
      { id, workspaceId: alex.workspaceId, creatorId: ALEX.id },
      { access: { people: { alex: "full", sam: "edit" } } },
    );
    await shared.synced;

    const samsDevice = track(device(s, SAM));
    const sam = await openNotes(s, samsDevice, SAM);
    await waitFor(() => indexedPages(sam.index.doc)[id] === "edit");
    const onSams = samsDevice.open(`page:${id}`);
    await onSams.synced;
    applyPagePatch(onSams.doc, { title: "Edited by Sam" });
    await waitFor(() => readPage(id, shared.doc)?.title === "Edited by Sam");

    applyPagePatch(onSams.doc, { access: { people: { sam: "full" } } });
    expect(await onSams.closed).toBe("access-change-refused");
    expect(storedPage(s, id)?.access.people).toEqual({
      alex: "full",
      sam: "edit",
    });
  });

  test("that is refused closes only its document; the device's other pages stay editable", async () => {
    const { s, notes, d, page } = await alexsPage();
    const other = await addPage(notes, d, ALEX);
    applyPagePatch(page.doc, { access: { people: { sam: "view" } } });
    expect(await page.closed).toBe("access-change-refused");
    applyPagePatch(other.doc, { title: "Still fine" });
    await waitFor(() => storedPage(s, other.id)?.title === "Still fine");
  });
});

describe("signing in and out", () => {
  test("signing in returns to the app, since the gateway has already signed the browser in", async () => {
    const s = await server();
    const res = await request(s, "/api/sign-in", ALEX);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
  });

  test("has no sign-out of its own: the App switcher signs out of every app", async () => {
    const s = await server();
    expect((await request(s, "/api/sign-out", ALEX)).status).toBe(404);
  });
});

describe("sync", () => {
  test("an upgrade that did not come through the gateway is refused", async () => {
    const s = await server();
    expect(await tryUpgrade(s)).toBe(401);
    expect(await tryUpgrade(s, ALEX)).toBe("open");
  });

  test("another person is refused a person's index and workspace, and keeps their own", async () => {
    const s = await server();
    const alex = await signedIn(s, ALEX);
    const samsDevice = track(device(s, SAM));
    const sam = await openNotes(s, samsDevice, SAM);

    const index = samsDevice.open(`index:${ALEX.id}`);
    const workspace = samsDevice.open(`workspace:${alex.workspaceId}`);
    expect(await index.denied).toBe("no-access");
    expect(await workspace.denied).toBe("no-access");
    expect(workspaceName(workspace.doc)).toBeNull();

    setWorkspaceName(sam.workspace.doc, "Still mine");
    await waitFor(
      () =>
        workspaceName(
          s.hocuspocus.documents.get(`workspace:${sam.workspaceId}`),
        ) === "Still mine",
    );
  });

  test("opens no other documents", async () => {
    const s = await server();
    const d = track(device(s, ALEX));
    await openNotes(s, d, ALEX);
    const page = d.open("pages/plan");
    expect(await page.denied).toBe("no-access");
  });

  test("a device's change to its index is refused and not applied", async () => {
    const s = await server();
    const { index, workspaceId } = await signedIn(s, ALEX);
    writeIndex(index.doc, {
      pages: new Map(),
      workspaces: new Set(["someone-elses"]),
    });
    expect(await index.closed).toBe("read-only");
    const stored = s.hocuspocus.documents.get(`index:${ALEX.id}`);
    expect(stored && indexedWorkspaces(stored)).toEqual([workspaceId]);
  });

  test("two devices rename the workspace together, and the name survives a server restart", async () => {
    let s = await server();
    const phone = await signedIn(s, ALEX);
    const laptop = await signedIn(s, ALEX);
    setWorkspaceName(phone.workspace.doc, "Household");
    await waitFor(() => workspaceName(laptop.workspace.doc) === "Household");

    for (const d of devices.splice(0)) d.destroy();
    const { dataDir } = s;
    await servers.pop()!.close();
    s = await server(dataDir);

    const again = await signedIn(s, ALEX);
    expect(workspaceName(again.workspace.doc)).toBe("Household");
  });

  test("edits made offline sync after reconnecting", async () => {
    const s = await server();
    const first = track(device(s, ALEX));
    const { workspace, workspaceId } = await openNotes(s, first, ALEX);
    const offlineState = Y.encodeStateAsUpdate(workspace.doc);
    first.destroy();

    const local = new Y.Doc();
    Y.applyUpdate(local, offlineState);
    setWorkspaceName(local, "Renamed offline");

    const after = track(device(s, ALEX)).open(`workspace:${workspaceId}`);
    Y.applyUpdate(after.doc, Y.encodeStateAsUpdate(local));
    await after.synced;
    await waitFor(
      () =>
        workspaceName(
          s.hocuspocus.documents.get(`workspace:${workspaceId}`),
        ) === "Renamed offline",
    );
  });
});

describe("storage", () => {
  test("health answers, and people are kept across a restart", async () => {
    const s = await server();
    expect(await (await request(s, "/api/health")).json()).toEqual({
      ok: true,
    });
    await request(s, "/api/session", ALEX);
    const versionRow = s.db.prepare("PRAGMA user_version").get() ?? {};
    expect(integer(versionRow, "user_version")).toBe(3);

    const { dataDir } = s;
    await servers.pop()!.close();
    const again = await server(dataDir);
    const ids = again.db
      .prepare("SELECT id FROM people")
      .all()
      .map((row) => text(row, "id"));
    expect(ids).toEqual(["alex"]);
  });

  test("an instance from before workspaces keeps its people, who get a workspace on their next visit", async () => {
    const dataDir = tempDataDir();
    const old = new DatabaseSync(path.join(dataDir, "notes.sqlite"));
    old.exec(`
      CREATE TABLE documents (name TEXT PRIMARY KEY, state BLOB NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE people (id TEXT PRIMARY KEY, role TEXT NOT NULL CHECK (role IN ('owner', 'member', 'guest')),
        name TEXT, created_at INTEGER NOT NULL);
      INSERT INTO people VALUES ('alex', 'owner', 'Alex', 1);
      PRAGMA user_version = 2;
    `);
    old.close();

    const s = await server(dataDir);
    expect(s.db.prepare("SELECT id, name FROM people").all()).toEqual([
      { id: "alex", name: "Alex" },
    ]);
    const { workspace } = await signedIn(s, ALEX);
    expect(workspaceName(workspace.doc)).toBe("Alex's workspace");
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
    const shell = await request(s, "/", ALEX);
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
