// Starts the whole homelab on this machine for trying it by hand (see README.md), and loads the test
// people (tools/test-people.ts) into the accounts service. Running it again only adds the people
// missing.
//
//   node tools/dev/start.ts      build the apps and the gateway, run everything with its logs until Ctrl+C
//
//   node tools/dev/start.ts reset stop the containers and delete their data
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { buildGatewayImage } from "@homelab/gateway/image";
import { APPS, LOAD_TEST_PEOPLE, PEOPLE } from "../test-people.ts";

const HERE = import.meta.dirname;
const ROOT = path.join(HERE, "..", "..");
const ENV_FILE = path.join(HERE, ".env");
const CA_FILE = path.join(HERE, "data", "gateway-root-ca.crt");

const DOMAIN = process.env.HOMELAB_DOMAIN ?? "homelab.localhost";
const PORT = Number(process.env.GATEWAY_PORT ?? 8443);
const ACCOUNTS_URL = `https://accounts.${DOMAIN}:${PORT}`;
const appUrl = (site: string) => `https://${site}.${DOMAIN}:${PORT}/`;

function compose(...args: string[]): string {
  return execFileSync("docker", ["compose", ...args], {
    cwd: HERE,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

async function startHomelab(): Promise<void> {
  console.log("Building Home, Notes and the Encyclopedia…");
  execFileSync(
    "npx",
    [
      "nx",
      "run-many",
      "-t",
      "build",
      "-p",
      "home-web",
      "notes-web",
      "encyclopedia-web",
    ],
    { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] },
  );
  console.log("Building the gateway, with the App switcher in it…");
  buildGatewayImage();

  // Ctrl+C reaches docker compose too, which stops the containers and then exits.
  process.on("SIGINT", () => {});
  const up = spawn("docker", ["compose", "up"], {
    cwd: HERE,
    stdio: "inherit",
  });
  const exited = new Promise<number>((resolve) =>
    up.on("exit", (code) => resolve(code ?? 0)),
  );

  // Fails only the set-up: the containers keep running, with their logs.
  void (async () => {
    const ca = await gatewayCa();
    mkdirSync(path.dirname(CA_FILE), { recursive: true });
    writeFileSync(CA_FILE, ca);
    await loadTestPeople();
  })().then(printSummary, (error: unknown) =>
    console.error(
      `\nLoading the test people failed: ${String(error)}\nIf it keeps failing, \`npm run dev:reset\` starts over.\n`,
    ),
  );

  process.exit(await exited);
}

/**
 * Makes the test people who are missing, with the accounts service's own loader, once the service
 * has made its tables.
 */
async function loadTestPeople(): Promise<void> {
  for (let i = 0; ; i++) {
    try {
      execFileSync(
        "docker",
        [
          "compose",
          "exec",
          "accounts",
          "wget",
          "-q",
          "--spider",
          "http://127.0.0.1:3000/sign-in",
        ],
        { cwd: HERE, stdio: "ignore" },
      );
      break;
    } catch (error) {
      if (i >= 120) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  execFileSync(
    "docker",
    ["compose", "exec", "-T", "accounts", "node", ...LOAD_TEST_PEOPLE],
    {
      cwd: HERE,
      input: JSON.stringify(PEOPLE),
      stdio: ["pipe", "ignore", "inherit"],
    },
  );
}

/** A link that signs the browser in as the person, with no password, and opens Home. */
const signInLink = (email: string) =>
  `${ACCOUNTS_URL}/test-sign-in?email=${encodeURIComponent(email)}&return-to=${encodeURIComponent(appUrl("home"))}`;

function printSummary(): void {
  console.log(`
The homelab is running. Ctrl+C stops it, keeping its data.

  Accounts      ${ACCOUNTS_URL}/
${APPS.map((app) => `  ${app.name.padEnd(13)} ${appUrl(app.site)}`).join("\n")}

Test people, signing in by email with the password, or in one click with their link:`);
  for (const person of PEOPLE)
    console.log(`
  ${person.email.padEnd(18)} ${person.password.padEnd(26)} ${person.gets}
    ${signInLink(person.email)}`);
  console.log(`
The certificates come from the gateway's own CA, so the browser warns until you trust it. Trust
${path.relative(process.cwd(), CA_FILE)} to test installing the apps and opening them offline
(tools/dev/README.md says how).
`);
}

/** The gateway's root certificate, which it makes on first start. */
async function gatewayCa(): Promise<string> {
  for (let i = 0; i < 60; i++) {
    try {
      return compose(
        "exec",
        "gateway",
        "cat",
        "/data/caddy/pki/authorities/local/root.crt",
      );
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("The gateway made no CA");
}

// The accounts service signs its session cookies with ACCOUNTS_SECRET, so it is made once and kept
// with the data. A file from before it, with another service's key, is made again.
if (
  !existsSync(ENV_FILE) ||
  !readFileSync(ENV_FILE, "utf8").includes("ACCOUNTS_SECRET=")
)
  writeFileSync(
    ENV_FILE,
    `ACCOUNTS_SECRET=${randomBytes(32).toString("hex")}\n`,
  );
const command = process.argv[2] ?? "start";
if (command === "reset") {
  compose("down", "--volumes", "--remove-orphans");
  rmSync(ENV_FILE, { force: true });
  rmSync(path.dirname(CA_FILE), { recursive: true, force: true });
} else if (command === "start") {
  await startHomelab();
} else {
  console.error(`Unknown command ${command}. Use start or reset.`);
  process.exit(1);
}
