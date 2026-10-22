import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, test } from "vitest";
import { startServer, type HomeServer } from "../src/server.ts";
import { manifestReader, type ReadManifest } from "../src/manifests.ts";

const HOMELAB = "https://home.test";

/** Manifests by hostname, as each app serves its own. */
const MANIFESTS: Record<string, unknown> = {
  "home.home.test": {
    name: "Home",
    homelab: { opens_offline: true },
    icons: [{ src: "icons/icon-192.png", sizes: "192x192" }],
  },
  "notes.home.test": {
    name: "Notes",
    homelab: { opens_offline: true },
    icons: [
      { src: "icons/icon-512.png", sizes: "512x512", purpose: "maskable" },
      { src: "icons/icon-192.png", sizes: "192x192" },
      { src: "icons/icon-512.png", sizes: "512x512" },
    ],
  },
  "encyclopedia.home.test": {
    short_name: "Encyclopedia",
    homelab: { opens_offline: true },
    icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
  },
  // A bundled app, which says nothing about opening offline.
  "vault.home.test": { name: "Vault", icons: [] },
};

const fromTable: ReadManifest = async (url) => MANIFESTS[url.hostname];

const HOME_APP = {
  id: "home",
  url: "https://home.home.test/",
  name: "Home",
  icon: "https://home.home.test/icons/icon-192.png",
  opensOffline: true,
};
const NOTES_APP = {
  id: "notes",
  url: "https://notes.home.test/",
  name: "Notes",
  icon: "https://notes.home.test/icons/icon-512.png",
  opensOffline: true,
};
const ENCYCLOPEDIA_APP = {
  id: "encyclopedia",
  url: "https://encyclopedia.home.test/",
  name: "Encyclopedia",
  icon: "https://encyclopedia.home.test/icons/icon-192.png",
  opensOffline: true,
};

const servers: HomeServer[] = [];
const others: Server[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.close();
  for (const s of others.splice(0)) s.close();
});

async function home(
  readManifest: ReadManifest = fromTable,
  homelabUrl = HOMELAB,
) {
  const server = await startServer({ homelabUrl, port: 0, readManifest });
  servers.push(server);
  return server;
}

/** A request as it arrives from the gateway; with no `username`, as if it had not. */
function me(
  server: HomeServer,
  person?: {
    username: string;
    name?: string;
    email?: string;
    groups?: string[];
  },
  headers: Record<string, string> = {},
) {
  return fetch(`http://localhost:${server.port}/api/me`, {
    headers: {
      ...headers,
      ...(person && {
        "remote-user": person.username,
        ...(person.name && { "remote-name": encodeURIComponent(person.name) }),
        ...(person.email && { "remote-email": person.email }),
        ...(person.groups?.length && {
          "remote-groups": person.groups.join(","),
        }),
      }),
    },
  });
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The apps in an answer from /api/me. */
async function appsIn(res: Response): Promise<Record<string, unknown>[]> {
  const body: unknown = await res.json();
  const apps = isRecord(body) ? body.apps : undefined;
  return Array.isArray(apps) ? apps.filter(isRecord) : [];
}

async function appsOf(server: HomeServer, groups: string[]) {
  const apps = await appsIn(await me(server, { username: "ada", groups }));
  return apps.map((app) => app.id);
}

describe("who is signed in", () => {
  test("names the person, where to sign out, and their apps", async () => {
    const s = await home();
    const res = await me(s, {
      username: "ada",
      name: "Ada Lovelace",
      email: "ada@example.com",
      groups: ["notes-admins", "encyclopedia"],
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      person: {
        username: "ada",
        name: "Ada Lovelace",
        email: "ada@example.com",
      },
      signOutUrl: "https://accounts.home.test/logout",
      apps: [ENCYCLOPEDIA_APP, HOME_APP, NOTES_APP],
    });
  });

  test("has no name or email when VoidAuth has none", async () => {
    const s = await home();
    expect(await (await me(s, { username: "eve" })).json()).toMatchObject({
      person: { username: "eve", name: null, email: null },
    });
  });

  test("is nobody on a request that did not come through the gateway", async () => {
    const s = await home();
    expect((await me(s)).status).toBe(401);
  });
});

describe("a person's apps", () => {
  test("come from their groups, the -admins ones included", async () => {
    const s = await home();
    expect(await appsOf(s, ["notes"])).toEqual(["home", "notes"]);
    expect(await appsOf(s, ["notes-admins"])).toEqual(["home", "notes"]);
    expect(await appsOf(s, ["notes", "notes-admins"])).toEqual([
      "home",
      "notes",
    ]);
  });

  test("always include Home, even with no groups", async () => {
    const s = await home();
    expect(await appsOf(s, [])).toEqual(["home"]);
  });

  test("skip groups with no app, so auth_admins alone lists nothing", async () => {
    const s = await home();
    expect(await appsOf(s, ["auth_admins"])).toEqual(["home"]);
    expect(await appsOf(s, ["auth_admins", "encyclopedia", "family"])).toEqual([
      "encyclopedia",
      "home",
    ]);
  });

  test("count an app without the homelab member as not opening offline", async () => {
    const s = await home();
    const apps = await appsIn(
      await me(s, { username: "ada", groups: ["vault"] }),
    );
    expect(apps).toContainEqual({
      id: "vault",
      url: "https://vault.home.test/",
      name: "Vault",
      icon: null,
      opensOffline: false,
    });
  });

  test("keep the port of the homelab's address", async () => {
    const s = await home(fromTable, "https://home.test:8443");
    expect(await (await me(s, { username: "ada" })).json()).toMatchObject({
      signOutUrl: "https://accounts.home.test:8443/logout",
      apps: [{ url: "https://home.home.test:8443/" }],
    });
  });

  test("are read from each manifest once, not on every request", async () => {
    const reads: string[] = [];
    const s = await home(async (url) => {
      reads.push(url.href);
      return MANIFESTS[url.hostname];
    });
    await appsOf(s, ["notes"]);
    await appsOf(s, ["notes", "auth_admins"]);
    expect(reads.toSorted()).toEqual([
      "https://home.home.test/manifest.webmanifest",
      "https://notes.home.test/manifest.webmanifest",
    ]);
  });

  test("keep an app listed while its manifest can't be read for a moment", async () => {
    let up = true;
    const s = await home(async (url) =>
      up || url.hostname.startsWith("home.")
        ? MANIFESTS[url.hostname]
        : undefined,
    );
    expect(await appsOf(s, ["notes"])).toEqual(["home", "notes"]);
    up = false;
    expect(await appsOf(s, ["notes"])).toEqual(["home", "notes"]);
  });
});

describe("other apps reading the answer", () => {
  const ADA = { username: "ada", groups: ["notes"] };

  test("is allowed, with credentials, for an app under the parent domain", async () => {
    const s = await home();
    const res = await me(s, ADA, { origin: "https://notes.home.test" });
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://notes.home.test",
    );
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    expect(res.headers.get("vary")).toContain("Origin");
  });

  test("is refused to any other origin", async () => {
    const s = await home();
    for (const origin of [
      "https://evil.example",
      "https://home.test.evil.example",
      "https://notes.home.test.evil.example",
      "https://evilhome.test",
      "http://notes.home.test",
      "https://notes.home.test:8443",
      "https://a.b.home.test",
      "null",
    ]) {
      const res = await me(s, ADA, { origin });
      expect(res.headers.get("access-control-allow-origin"), origin).toBe(null);
      expect(res.headers.get("access-control-allow-credentials"), origin).toBe(
        null,
      );
    }
  });
});

describe("reading manifests through the gateway", () => {
  /** A gateway on this machine that serves each site's manifest by the Host header. */
  async function gateway(): Promise<{
    url: URL;
    seen: Record<string, string>[];
  }> {
    const seen: Record<string, string>[] = [];
    const server = createServer((req, res) => {
      seen.push({
        host: req.headers.host ?? "",
        path: req.url ?? "",
        proto: String(req.headers["x-forwarded-proto"]),
      });
      const manifest = MANIFESTS[(req.headers.host ?? "").split(":")[0] ?? ""];
      if (manifest && req.url === "/manifest.webmanifest") {
        res.writeHead(200, { "content-type": "application/manifest+json" });
        res.end(JSON.stringify(manifest));
      } else {
        res.writeHead(404).end();
      }
    });
    others.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    return { url: new URL(`http://127.0.0.1:${port}`), seen };
  }

  test("asks the gateway for each app's site, as its proxy would", async () => {
    const { url, seen } = await gateway();
    const read = manifestReader({ url });
    expect(
      await read(new URL("https://notes.home.test:8443/manifest.webmanifest")),
    ).toEqual(MANIFESTS["notes.home.test"]);
    expect(seen).toEqual([
      {
        host: "notes.home.test:8443",
        path: "/manifest.webmanifest",
        proto: "https",
      },
    ]);
  });

  test("finds nothing for a site with no manifest, or no gateway at all", async () => {
    const { url } = await gateway();
    expect(
      await manifestReader({ url })(
        new URL("https://nope.home.test/manifest.webmanifest"),
      ),
    ).toBe(undefined);
    expect(
      await manifestReader({ url: new URL("http://127.0.0.1:1") })(
        new URL("https://notes.home.test/manifest.webmanifest"),
      ),
    ).toBe(undefined);
  });
});
