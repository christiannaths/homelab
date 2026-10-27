// The sign-in check (signed-in.caddyfile) in the gateway image, in front of a stand-in for the
// accounts service and an app that echoes what reached it. Needs Docker; run with
// `npm run e2e -w @homelab/gateway`.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { identityHeaders } from "@homelab/identity";
import { buildGatewayImage } from "../src/image.ts";
import {
  get as getFrom,
  listen,
  startGateway,
  type Gateway,
} from "./gateway.ts";

const SIGN_IN = "https://accounts.home.test/sign-in";
const FORGED = identityHeaders({
  id: "mallory",
  name: "Mallory",
  email: "mallory@example.com",
  access: { notes: "admin" },
});

let gateway: Gateway | undefined;
const closers: (() => void)[] = [];

interface Reply {
  status: number;
  location: string | undefined;
  allowOrigin: string | string[] | undefined;
  /** What the app received: the path and the Remote-* headers. */
  seen: unknown;
}

async function get(
  route: string,
  headers: Record<string, string> = {},
): Promise<Reply> {
  const reply = await getFrom(
    gateway?.port ?? 0,
    "app.home.test",
    route,
    headers,
  );
  return {
    status: reply.status,
    location: reply.headers.location,
    allowOrigin: reply.headers["access-control-allow-origin"],
    seen: reply.status === 200 ? JSON.parse(reply.body.toString()) : undefined,
  };
}

before(async () => {
  buildGatewayImage();
  // Answers as the accounts service's forward-auth does: the person for a session cookie, else
  // its sign-in page. This stand-in sends only some headers, so the Remote-Name a browser sends
  // must not survive either.
  const accounts = await listen((req, res) => {
    if (req.headers.cookie === "session=ada") {
      res.writeHead(200, { "Remote-User": "ada", "Remote-Groups": "notes" });
    } else {
      res.writeHead(302, { Location: SIGN_IN });
    }
    res.end();
  });
  closers.push(accounts.close);
  // Echoes what reached it.
  const app = await listen((req, res) => {
    const header = (name: string) => req.headers[name] ?? "";
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        path: req.url,
        user: header("remote-user"),
        name: header("remote-name"),
        email: header("remote-email"),
        groups: header("remote-groups"),
      }),
    );
  });
  closers.push(app.close);
  gateway = await startGateway(
    "homelab-gateway-signed-in-test",
    `{
	auto_https off
	admin off
}

http://app.home.test {
	route {
		import /etc/caddy/signed-in.caddyfile
		reverse_proxy host.docker.internal:${app.port}
	}
}

http:// {
	respond "Up"
}
`,
    { ACCOUNTS_UPSTREAM: `host.docker.internal:${accounts.port}` },
  );
});

after(() => {
  gateway?.stop();
  for (const close of closers) close();
});

describe("signed in", () => {
  test("passes the accounts service's person on, and none of the browser's headers", async () => {
    const reply = await get("/", { ...FORGED, cookie: "session=ada" });
    assert.deepEqual(reply.seen, {
      path: "/",
      user: "ada",
      name: "",
      email: "",
      groups: "notes",
    });
  });
});

describe("signed out", () => {
  test("lets an app's manifest and icons through, with no Remote-* headers", async () => {
    for (const route of [
      "/manifest.webmanifest",
      "/icons/icon-192.png",
      "/icons/icon.svg",
    ]) {
      const reply = await get(route, FORGED);
      assert.deepEqual(
        reply.seen,
        { path: route, user: "", name: "", email: "", groups: "" },
        route,
      );
    }
  });

  test("lets any page read the manifest and icons with CORS, and nothing else", async () => {
    assert.equal((await get("/icons/icon-192.png")).allowOrigin, "*");
    assert.equal((await get("/manifest.webmanifest")).allowOrigin, "*");
    assert.equal((await get("/")).allowOrigin, undefined);
  });

  test("sends every other path to sign in, including ones that climb out of /icons/", async () => {
    for (const route of [
      "/",
      "/index.html",
      "/sw.js",
      "/api/session",
      "/icons",
      "/icons/../index.html",
      "/icons/%2e%2e/index.html",
      "/icons/..%2findex.html",
      "/manifest.webmanifest/../index.html",
      "/manifest.json",
    ]) {
      const reply = await get(route, FORGED);
      assert.equal(reply.status, 302, route);
      assert.equal(reply.location, SIGN_IN, route);
    }
  });
});
