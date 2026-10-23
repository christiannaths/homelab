import { serve } from "@hono/node-server";
import { createAccounts } from "./accounts.ts";
import { configFromEnv } from "./config.ts";

const config = configFromEnv(process.env);
const accounts = await createAccounts(config);
const server = serve(
  { fetch: accounts.app.fetch, port: config.port },
  ({ port }) => console.log(`Accounts service listening on port ${port}`),
);

for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () =>
    server.close(() => {
      accounts.close();
      process.exit(0);
    }),
  );
