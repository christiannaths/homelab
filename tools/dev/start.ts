// Starts the whole homelab on this machine for trying it by hand (see README.md), and loads the test
// people below into VoidAuth. Running it again only fills in what is missing.
//
//   node tools/dev/start.ts      build the apps, run everything with its logs until Ctrl+C
//
//   node tools/dev/start.ts reset stop the containers and delete their data
//
// While it runs, https://login.<domain>:<port>/<username> signs the browser in as that account and
// opens their app (tools/login-links/).
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  loadFixtures,
  VoidAuthClient,
  type Person,
} from "@homelab/voidauth-fixtures";
import { loginLinks } from "../login-links/login-links.ts";

const HERE = import.meta.dirname;
const ROOT = path.join(HERE, "..", "..");
const ENV_FILE = path.join(HERE, ".env");
const CA_FILE = path.join(HERE, "data", "gateway-root-ca.crt");

const DOMAIN = process.env.HOMELAB_DOMAIN ?? "homelab.localhost";
const PORT = Number(process.env.GATEWAY_PORT ?? 8443);
const AUTH_URL = `https://auth.${DOMAIN}:${PORT}`;
const LOGIN_URL = `https://login.${DOMAIN}:${PORT}`;
const LOGIN_PORT = Number(process.env.LOGIN_PORT ?? 8444);

/** The instance admin VoidAuth creates on first run, who VoidAuth lets into every app. */
const ADMIN = {
  username: "auth_admin",
  password: "violet-quartz-harbour-71",
  groups: ["notes-admins", "encyclopedia"],
};

/** Each app's VoidAuth groups: being in any of them lets a person into the app. */
const APPS = [
  { host: `notes.${DOMAIN}`, name: "Notes", groups: ["notes", "notes-admins"] },
  {
    host: `encyclopedia.${DOMAIN}`,
    name: "Encyclopedia",
    groups: ["encyclopedia"],
  },
];

/** The test people, each with what their groups get them, for the summary. */
const PEOPLE: (Person & { gets: string })[] = [
  {
    username: "ada",
    password: "lantern-meadow-copper-48",
    name: "Ada Lovelace",
    groups: ["notes-admins", "encyclopedia"],
    gets: "Notes as an owner, and the Encyclopedia",
  },
  {
    username: "dana",
    password: "quartz-ember-willow-27",
    name: "Dana Scully",
    groups: ["notes"],
    gets: "Notes as a member, no Encyclopedia",
  },
  {
    username: "bob",
    password: "harbour-violet-thistle-93",
    name: "Bob Ross",
    groups: [],
    gets: "a homelab account but no apps",
  },
];

function compose(...args: string[]): string {
  return execFileSync("docker", ["compose", ...args], {
    cwd: HERE,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

async function startHomelab(): Promise<void> {
  console.log("Building Notes and the Encyclopedia…");
  execFileSync(
    "npx",
    ["nx", "run-many", "-t", "build", "-p", "notes-web", "encyclopedia-web"],
    { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] },
  );

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
    await loadFixtures(new VoidAuthClient({ url: AUTH_URL, ca }), {
      admin: ADMIN,
      apps: APPS,
      people: PEOPLE,
      readLog: () => compose("logs", "voidauth"),
    });
    createServer(
      loginLinks({
        domain: DOMAIN,
        port: PORT,
        voidauth: { url: AUTH_URL, ca },
        accounts: [ADMIN, ...PEOPLE],
        apps: APPS,
      }),
    ).listen(LOGIN_PORT, "127.0.0.1");
  })().then(printSummary, (error: unknown) =>
    console.error(
      `\nSetting VoidAuth up failed: ${String(error)}\nIf it keeps failing, \`npm run dev:reset\` starts over.\n`,
    ),
  );

  process.exit(await exited);
}

function printSummary(): void {
  console.log(`
The homelab is running. Ctrl+C stops it, keeping its data.

  Sign-in and admin pages  ${AUTH_URL}/admin
  Notes                    https://${APPS[0]?.host}:${PORT}/
  Encyclopedia             https://${APPS[1]?.host}:${PORT}/

Accounts:
  ${ADMIN.username.padEnd(10)} ${ADMIN.password.padEnd(26)} the homelab admin, every app`);
  for (const person of PEOPLE)
    console.log(
      `  ${person.username.padEnd(10)} ${person.password.padEnd(26)} ${person.gets}`,
    );
  console.log(`
Open one of these to be signed in as that account, skipping VoidAuth's sign-in page. Add an app,
as in ${LOGIN_URL}/ada/encyclopedia, to open that one instead.`);
  for (const account of [ADMIN, ...PEOPLE])
    console.log(
      `  ${account.username.padEnd(10)} ${LOGIN_URL}/${account.username}`,
    );
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

// VoidAuth encrypts its secrets with STORAGE_KEY, so it is made once and kept with the data.
if (!existsSync(ENV_FILE))
  writeFileSync(ENV_FILE, `STORAGE_KEY=${randomBytes(24).toString("hex")}\n`);
const command = process.argv[2] ?? "start";
if (command === "reset") {
  compose("down", "--volumes", "--remove-orphans");
  rmSync(ENV_FILE);
  rmSync(path.dirname(CA_FILE), { recursive: true, force: true });
} else if (command === "start") {
  await startHomelab();
} else {
  console.error(`Unknown command ${command}. Use start or reset.`);
  process.exit(1);
}
