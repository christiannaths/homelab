import path from "node:path";
import { startServer } from "./app.ts";

const here = import.meta.dirname;
const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) {
  console.error("Set BETTER_AUTH_SECRET to a long random string.");
  process.exit(1);
}

const port = Number(process.env.PORT ?? 3000);
const server = await startServer({
  dataDir: path.resolve(process.env.DATA_DIR ?? path.join(here, "../data")),
  webRoot: path.resolve(process.env.WEB_ROOT ?? path.join(here, "../public")),
  port,
  baseURL: process.env.BASE_URL ?? `http://localhost:${port}`,
  secret,
});
console.log(`notes server stack spike listening on port ${server.port}`);
