import path from "node:path";
import { startServer } from "./server.ts";

// Settings come from environment variables. How apps read and check them is issue #40.
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Set ${name}.`);
    process.exit(1);
  }
  return value;
}

const port = Number(process.env.PORT ?? 3000);
const server = await startServer({
  dataDir: path.resolve(
    process.env.DATA_DIR ?? path.join(import.meta.dirname, "../data"),
  ),
  port,
  publicUrl: process.env.PUBLIC_URL ?? `http://localhost:${port}`,
  clientDir: path.join(import.meta.dirname, "../../web/dist"),
  oidc: {
    issuer: required("OIDC_ISSUER"),
    clientId: process.env.OIDC_CLIENT_ID ?? "notes",
    clientSecret: required("OIDC_CLIENT_SECRET"),
  },
});
console.log(`Notes server listening on port ${server.port}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    // Writes documents still waiting on Hocuspocus's debounce before exiting.
    void server.close().then(() => process.exit(0));
  });
}
