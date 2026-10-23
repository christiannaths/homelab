import { serve } from "@hono/node-server";
import { createAccounts } from "./app.ts";
import { configFromEnv } from "./config.ts";

const config = configFromEnv(process.env);
const { app, firstRunLink } = await createAccounts(config);
serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
  console.log(`accounts listening on ${port}`);
  const link = firstRunLink();
  if (link) console.log(`first run: create the admin account at ${link}`);
});
