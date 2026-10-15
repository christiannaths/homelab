import { createReadStream, existsSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

/** Serves the built PWA, falling back to index.html for client-side routes. */
export function serveStatic(root: string, req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;

  const url = new URL(req.url ?? "/", "http://localhost");
  let file = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
  if (!file.startsWith(root)) return false;
  if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(root, "index.html");
  if (!existsSync(file)) return false;

  const name = path.basename(file);
  // Hashed assets never change; everything else must revalidate so app updates arrive.
  const immutable = file.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, {
    "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream",
    "Cache-Control":
      immutable ? "public, max-age=31536000, immutable"
      : name === "sw.js" ? "no-cache, no-store"
      : "no-cache",
  });
  if (req.method === "HEAD") res.end();
  else createReadStream(file).pipe(res);
  return true;
}
