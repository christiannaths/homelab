// A stand-in homelab app behind the gateway: an offline-capable page, `/api/me`, and a `/sync`
// WebSocket. It has no sign-in of its own; see person.ts. The WebSocket handshake is written out
// by hand so the image needs no npm packages.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { Duplex } from "node:stream";
import { personFrom } from "./person.ts";

const APP_ID = required("APP_ID");
const APP_NAME = required("APP_NAME");
const SIGN_OUT_URL = required("SIGN_OUT_URL");
const PORT = Number(process.env.PORT ?? 8080);

const STATIC: Record<string, { file: string; type: string }> = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
  "/sw.js": { file: "sw.js", type: "text/javascript; charset=utf-8" },
  "/manifest.webmanifest": {
    file: "manifest.webmanifest",
    type: "application/manifest+json",
  },
};

const server = createServer((req, res) => {
  handle(req, res).catch((error: unknown) => {
    console.error(error);
    res.writeHead(500).end();
  });
});

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const path = new URL(req.url ?? "/", "http://app").pathname;
  if (path === "/api/me") {
    const person = personFrom(req.headers, APP_ID);
    res.writeHead(person ? 200 : 401, { "content-type": "application/json" });
    res.end(
      JSON.stringify(
        person ? { app: APP_NAME, signOutUrl: SIGN_OUT_URL, person } : null,
      ),
    );
    return;
  }
  const asset = STATIC[path];
  if (!asset) {
    res.writeHead(404).end();
    return;
  }
  const body = (
    await readFile(new URL(`public/${asset.file}`, import.meta.url), "utf8")
  ).replaceAll("%APP_NAME%", APP_NAME);
  res.writeHead(200, {
    "content-type": asset.type,
    "cache-control": "no-cache",
  });
  res.end(body);
}

server.on("upgrade", (req: IncomingMessage, socket: Duplex) => {
  const person = personFrom(req.headers, APP_ID);
  const key = req.headers["sec-websocket-key"];
  if (req.url !== "/sync" || !person || typeof key !== "string") {
    socket.end("HTTP/1.1 401 Unauthorized\r\nconnection: close\r\n\r\n");
    return;
  }
  const accept = createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\nupgrade: websocket\r\nconnection: Upgrade\r\n" +
      `sec-websocket-accept: ${accept}\r\n\r\n`,
  );
  socket.write(
    textFrame(JSON.stringify({ app: APP_NAME, hello: person.username })),
  );
  // The spike only needs the greeting; anything the browser sends is ignored.
  socket.on("data", () => {});
  socket.on("error", () => socket.destroy());
});

server.listen(PORT, () => console.log(`${APP_NAME} listening on ${PORT}`));

/** One unmasked server-to-client text frame. */
function textFrame(text: string): Buffer {
  const payload = Buffer.from(text);
  if (payload.length > 125) throw new Error("frame too long for the spike");
  return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
}
