// The App switcher in the gateway image (switcher.caddyfile), in front of an app on this machine
// that answers with pages, other files and compressed pages. Needs Docker; run with
// `npm run e2e -w @homelab/gateway`.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { brotliCompressSync, gunzipSync, gzipSync } from "node:zlib";
import { buildGatewayImage } from "../src/image.ts";
import {
  get as getFrom,
  listen,
  startGateway,
  type Gateway,
} from "./gateway.ts";

const PAGE =
  "<!doctype html><html><head><title>App</title></head><body><p>App</p></body></html>";
const SCRIPT = "export const app = 1;\n";
const DATA = JSON.stringify({ html: "<body></body>" });

let gateway: Gateway | undefined;
let closeApp: (() => void) | undefined;

/** A request to the app's site, with the body as the browser would read it. */
async function get(route: string, headers: Record<string, string> = {}) {
  const reply = await getFrom(
    gateway?.port ?? 0,
    "app.home.test",
    route,
    headers,
  );
  const body =
    reply.headers["content-encoding"] === "gzip"
      ? gunzipSync(reply.body)
      : reply.body;
  return { ...reply, text: body.toString() };
}

/** The script the gateway put before </body>, or undefined. */
function switcherIn(page: string): string | undefined {
  return /<script>(.*customElements.*)<\/script><\/body>/s.exec(page)?.[1];
}

before(async () => {
  buildGatewayImage();
  const app = await listen((req, res) => {
    const send = (type: string, body: string | Buffer, extra = {}) => {
      res.writeHead(200, {
        "Content-Type": type,
        "ETag": '"v1"',
        "Last-Modified": "Wed, 21 Oct 2026 07:28:00 GMT",
        ...extra,
      });
      res.end(body);
    };
    switch (req.url) {
      case "/app.js":
        return send("text/javascript", SCRIPT);
      case "/data.json":
        return send("application/json", DATA);
      // Compressed however it was asked, as an app that compresses its own answers would.
      case "/compressed": {
        const asked = req.headers["accept-encoding"] ?? "";
        if (asked.includes("br"))
          return send("text/html", brotliCompressSync(PAGE), {
            "Content-Encoding": "br",
          });
        if (asked.includes("gzip"))
          return send("text/html", gzipSync(PAGE), {
            "Content-Encoding": "gzip",
          });
        return send("text/html", PAGE);
      }
      // Compressed in a way the gateway can't undo, whatever it asked for.
      case "/brotli-anyway":
        return send("text/html", brotliCompressSync(PAGE), {
          "Content-Encoding": "br",
        });
      case "/csp-header":
        return send("text/html", PAGE, {
          "Content-Security-Policy":
            "script-src 'self'; frame-ancestors 'self'",
        });
      case "/csp-meta":
        return send(
          "text/html",
          PAGE.replace(
            "<head>",
            `<head><meta http-equiv="Content-Security-Policy" content="script-src 'self'">`,
          ),
        );
      case "/csp-no-script-limit":
        return send("text/html", PAGE, {
          "Content-Security-Policy": "frame-ancestors 'self'",
        });
      case "/export.html":
        return send("text/html", PAGE, {
          "Content-Disposition": 'attachment; filename="export.html"',
        });
      case "/missing":
        res.writeHead(404, { "Content-Type": "text/html" });
        return res.end("<p>Not found</p>");
      default:
        return send("text/html; charset=utf-8", PAGE);
    }
  });
  closeApp = app.close;
  gateway = await startGateway(
    "homelab-gateway-switcher-test",
    `{
	auto_https off
	admin off
}

http://app.home.test {
	route {
		import /etc/caddy/switcher.caddyfile
		reverse_proxy host.docker.internal:${app.port}
	}
}

http:// {
	respond "Up"
}
`,
  );
});

after(() => {
  gateway?.stop();
  closeApp?.();
});

describe("pages", () => {
  test("get the whole switcher inline, before </body>", async () => {
    const reply = await get("/", { "sec-fetch-dest": "document" });
    const script = switcherIn(reply.text);
    assert.ok(script, reply.text);
    assert.ok(script.includes("homelab-switcher"));
    assert.ok(reply.text.startsWith(PAGE.slice(0, PAGE.indexOf("</body>"))));
    assert.equal(Number(reply.headers["content-length"]), reply.body.length);
  });

  test("get it when an offline-first app's service worker saves them", async () => {
    const reply = await get("/index.html", { "sec-fetch-dest": "empty" });
    assert.ok(switcherIn(reply.text));
  });

  test("get it when the browser says nothing about where they go", async () => {
    assert.ok(switcherIn((await get("/")).text));
  });

  test("get it on an app's error pages", async () => {
    const reply = await get("/missing");
    assert.equal(reply.status, 404);
    assert.match(reply.text, /^<p>Not found<\/p><script>.*<\/script>$/s);
  });

  test("drop the app's validators, so a browser never revalidates an old switcher", async () => {
    const reply = await get("/");
    assert.equal(reply.headers.etag, undefined);
    assert.equal(reply.headers["last-modified"], undefined);
  });

  test("get it from an app that compresses its own answers, and reach the browser compressed", async () => {
    const reply = await get("/compressed", { "accept-encoding": "br, gzip" });
    assert.equal(reply.headers["content-encoding"], "gzip");
    assert.ok(switcherIn(reply.text));
  });

  test("compressed in a way the gateway can't undo come through intact, without the switcher", async () => {
    const reply = await get("/brotli-anyway", { "accept-encoding": "br" });
    assert.equal(reply.headers["content-encoding"], "br");
    assert.deepEqual(reply.body, brotliCompressSync(PAGE));
  });
});

describe("pages inside another page", () => {
  for (const dest of ["iframe", "frame", "object", "embed"])
    test(`get no switcher (Sec-Fetch-Dest: ${dest})`, async () => {
      const reply = await get("/", { "sec-fetch-dest": dest });
      assert.equal(reply.text, PAGE);
      assert.equal(reply.headers.etag, '"v1"');
    });
});

describe("everything else", () => {
  test("passes through untouched", async () => {
    const script = await get("/app.js", { "sec-fetch-dest": "script" });
    assert.equal(script.text, SCRIPT);
    assert.equal(script.headers.etag, '"v1"');
    const data = await get("/data.json", { "sec-fetch-dest": "empty" });
    assert.equal(data.text, DATA);
    assert.equal(data.headers.etag, '"v1"');
  });

  test("comes compressed as the browser asked, as the app sent it", async () => {
    const reply = await get("/compressed", {
      "sec-fetch-dest": "script",
      "accept-encoding": "br",
    });
    assert.equal(reply.headers["content-encoding"], "br");
    assert.deepEqual(reply.body, brotliCompressSync(PAGE));
  });

  test("passes HTML downloads through untouched", async () => {
    const reply = await get("/export.html");
    assert.equal(reply.text, PAGE);
    assert.equal(reply.headers.etag, '"v1"');
  });

  test("passes HEAD requests through untouched", async () => {
    const reply = await getFrom(
      gateway?.port ?? 0,
      "app.home.test",
      "/",
      {},
      "HEAD",
    );
    assert.equal(reply.headers.etag, '"v1"');
  });
});

describe("security policies", () => {
  /** The CSP source that lets the inline switcher run. */
  const hashOf = (page: string) =>
    `'sha256-${createHash("sha256")
      .update(switcherIn(page) ?? "")
      .digest("base64")}'`;

  test("a policy in a header lets the switcher run", async () => {
    const reply = await get("/csp-header");
    assert.equal(
      reply.headers["content-security-policy"],
      `script-src 'self' ${hashOf(reply.text)}; frame-ancestors 'self'`,
    );
  });

  test("a policy in the page lets the switcher run", async () => {
    const reply = await get("/csp-meta");
    assert.ok(
      reply.text.includes(
        `<meta http-equiv="Content-Security-Policy" content="script-src 'self' ${hashOf(reply.text)}">`,
      ),
      reply.text,
    );
  });

  test("a page that doesn't limit scripts gets no policy added", async () => {
    assert.equal(
      (await get("/csp-no-script-limit")).headers["content-security-policy"],
      "frame-ancestors 'self'",
    );
    assert.equal(
      (await get("/")).headers["content-security-policy"],
      undefined,
    );
  });
});
