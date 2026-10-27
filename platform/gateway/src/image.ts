// Builds the gateway image (../Dockerfile) from this checkout, for the stacks and tests that run it.
// Docker's cache makes a build with nothing changed take a moment.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** The tag every stack in this repository runs the gateway as. */
export const GATEWAY_IMAGE = "homelab-gateway";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

export function buildGatewayImage(): void {
  // Behind a proxy that intercepts TLS, as in a cloud environment, npm and Go need its CA.
  const ca = process.env.NODE_EXTRA_CA_CERTS;
  execFileSync(
    "docker",
    [
      "build",
      "--quiet",
      "--tag",
      GATEWAY_IMAGE,
      "--file",
      "platform/gateway/Dockerfile",
      ...(ca ? ["--secret", `id=ca-certs,src=${ca}`] : []),
      ".",
    ],
    { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] },
  );
}
