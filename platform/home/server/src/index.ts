import path from "node:path";
import { startServer } from "./server.ts";

// Settings come from environment variables. How apps read and check them is issue #40.
const server = await startServer({
  port: Number(process.env.PORT ?? 3000),
  clientDir: path.join(import.meta.dirname, "../../web/dist"),
});
console.log(`Home server listening on port ${server.port}`);

for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => void server.close().then(() => process.exit(0)));
