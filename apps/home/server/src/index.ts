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

const server = await startServer({
  homelabUrl: required("HOMELAB_URL"),
  port: Number(process.env.PORT ?? 3000),
  gateway: {
    url: process.env.GATEWAY_URL ? new URL(process.env.GATEWAY_URL) : undefined,
    caFile: process.env.GATEWAY_CA || undefined,
  },
  clientDir: path.join(import.meta.dirname, "../../web/dist"),
});
console.log(`Home server listening on port ${server.port}`);

for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => void server.close().then(() => process.exit(0)));
