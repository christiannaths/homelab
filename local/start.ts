// Starts the whole homelab on this machine for trying it by hand (see README.md), and sets VoidAuth
// up the way a homelab admin would: the admin password, a group per app grant, a ProxyAuth domain
// per app, and one invited account per test person. Running it again only fills in what is missing.
//
//   node local/start.ts          build the apps, run everything with its logs until Ctrl+C
//   node local/start.ts reset    stop the containers and delete their data
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:https";
import path from "node:path";

const HERE = import.meta.dirname;
const ROOT = path.join(HERE, "..");
const ENV_FILE = path.join(HERE, ".env");
const CA_FILE = path.join(HERE, "data", "gateway-root-ca.crt");

const DOMAIN = process.env.HOMELAB_DOMAIN ?? "homelab.localhost";
const PORT = Number(process.env.GATEWAY_PORT ?? 8443);
const AUTH_HOST = `auth.${DOMAIN}`;
const AUTH_URL = `https://${AUTH_HOST}:${PORT}`;

/** The instance admin VoidAuth creates on first run. */
const ADMIN = { username: "auth_admin", password: "violet-quartz-harbour-71" };

/** Each app's VoidAuth groups: being in any of them lets a person into the app. */
const APPS = [
  { host: `notes.${DOMAIN}`, name: "Notes", groups: ["notes", "notes-admins"] },
  {
    host: `encyclopedia.${DOMAIN}`,
    name: "Encyclopedia",
    groups: ["encyclopedia"],
  },
];

interface Person {
  username: string;
  password: string;
  name: string;
  groups: string[];
  gets: string;
}

const PEOPLE: Person[] = [
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
    await setUpVoidAuth(new Client(ca));
  })().then(printSummary, (error: unknown) =>
    console.error(`\nSetting VoidAuth up failed: ${String(error)}\n`),
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
The certificates come from the gateway's own CA, so the browser warns until you trust it. Trust
${path.relative(process.cwd(), CA_FILE)} to test installing the apps and opening them offline
(local/README.md says how).
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

async function setUpVoidAuth(admin: Client): Promise<void> {
  await admin.waitUntilUp();
  if (!(await admin.signIn(ADMIN))) {
    await admin.json(
      "Setting the admin password",
      "POST",
      "/api/public/reset_password",
      {
        ...firstRunLink(),
        newPassword: ADMIN.password,
      },
    );
    if (!(await admin.signIn(ADMIN)))
      throw new Error(
        `Can't sign in as ${ADMIN.username}. If its password was changed, run \`npm run dev:reset\` to start over.`,
      );
  }

  const groupNames = APPS.flatMap((app) => app.groups);
  let groups = records(
    await admin.json("Listing groups", "GET", "/api/admin/groups"),
  );
  for (const name of groupNames)
    if (!groups.some((group) => group.name === name))
      await admin.json(`Adding group ${name}`, "POST", "/api/admin/group", {
        name,
        mfaRequired: false,
        autoAssign: false,
        users: [],
        customClaims: [],
      });
  groups = records(
    await admin.json("Listing groups", "GET", "/api/admin/groups"),
  );

  const domains = records(
    await admin.json(
      "Listing ProxyAuth domains",
      "GET",
      "/api/admin/proxyauths",
    ),
  );
  for (const app of APPS) {
    const domain = `${app.host}/*`;
    if (!domains.some((existing) => existing.domain === domain))
      await admin.json(
        `Adding ${app.name}' ProxyAuth domain`,
        "POST",
        "/api/admin/proxyauth",
        {
          domain,
          mfaRequired: false,
          maxSessionLength: null,
          groups: app.groups,
        },
      );
  }

  const listed = await admin.json(
    "Listing accounts",
    "GET",
    "/api/admin/users?page=0&pageSize=1000",
  );
  const users = records(isRecord(listed) ? listed.users : undefined);
  for (const person of PEOPLE) {
    if (users.some((user) => user.username === person.username)) continue;
    const invite = await admin.json(
      `Inviting ${person.username}`,
      "POST",
      "/api/admin/invitation",
      {
        username: person.username,
        name: person.name,
        email: null,
        userExpiresAt: null,
        emailVerified: false,
        mfaRequired: false,
        groups: groups
          .filter((group) => person.groups.includes(String(group.name)))
          .map((group) => ({ id: group.id, name: group.name })),
        customClaims: [],
      },
    );
    // Accepting an invite happens inside a sign-in interaction, as on VoidAuth's invite page.
    const newcomer = new Client(admin.ca);
    await newcomer.startInteraction();
    await newcomer.json(
      `Accepting ${person.username}'s invite`,
      "POST",
      "/api/interaction/register",
      {
        username: person.username,
        password: person.password,
        name: person.name,
        inviteId: stringField(invite, "id"),
        challenge: stringField(invite, "challenge"),
      },
    );
  }
}

/** The first-run password link VoidAuth prints: `${APP_URL}/reset_password?id=…&challenge=…`. */
function firstRunLink(): { userId: string; challenge: string } {
  const link = /https:\/\/\S+\/reset_password\?id=[\w-]+&challenge=[\w-]+/.exec(
    compose("logs", "voidauth"),
  )?.[0];
  if (!link)
    throw new Error(
      "VoidAuth printed no first-run link. Run `npm run dev:reset` to start over.",
    );
  const params = new URL(link).searchParams;
  return {
    userId: params.get("id") ?? "",
    challenge: params.get("challenge") ?? "",
  };
}

interface Response {
  status: number;
  location: string | undefined;
  text: string;
}

/**
 * One browser's worth of cookies on VoidAuth, reached through the gateway on this machine without
 * DNS, and checked against the gateway's CA.
 */
class Client {
  readonly ca: string;
  private readonly cookies = new Map<string, string>();

  constructor(ca: string) {
    this.ca = ca;
  }

  async waitUntilUp(): Promise<void> {
    for (let i = 0; i < 120; i++) {
      const response = await this.send("GET", "/api/public/config").catch(
        () => null,
      );
      if (response?.status === 200) return;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("VoidAuth did not answer through the gateway in time");
  }

  /** Begins signing in, as an app's redirect to VoidAuth does. */
  async startInteraction(): Promise<void> {
    const start = new URLSearchParams({
      client_id: "auth_internal_client",
      response_type: "none",
      redirect_uri: `${AUTH_URL}/api/cb`,
      scope: "openid",
    });
    await this.send("GET", `/oidc/auth?${start}`);
  }

  /** Signs in with a password and follows the redirects that set VoidAuth's session cookie. */
  async signIn(account: {
    username: string;
    password: string;
  }): Promise<boolean> {
    await this.startInteraction();
    const response = await this.send("POST", "/api/interaction/login", {
      input: account.username,
      password: account.password,
      remember: false,
    });
    if (response.status === 401) return false;
    if (response.status !== 200)
      throw new Error(`Signing in failed: ${response.status} ${response.text}`);
    let next: string | undefined = stringField(
      JSON.parse(response.text),
      "location",
    );
    for (let i = 0; next && i < 10; i++) {
      const url = new URL(next, AUTH_URL);
      if (url.origin !== AUTH_URL) break;
      next = (await this.send("GET", url.pathname + url.search)).location;
    }
    return true;
  }

  /** Fails with `what` on any status from 300 up. */
  async json(
    what: string,
    method: string,
    route: string,
    body?: unknown,
  ): Promise<unknown> {
    const response = await this.send(method, route, body);
    if (response.status >= 300)
      throw new Error(`${what} failed: ${response.status} ${response.text}`);
    return response.text ? JSON.parse(response.text) : null;
  }

  private send(
    method: string,
    route: string,
    body?: unknown,
  ): Promise<Response> {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const headers: Record<string, string> = { host: `${AUTH_HOST}:${PORT}` };
    if (payload !== undefined) headers["content-type"] = "application/json";
    if (this.cookies.size > 0)
      headers.cookie = [...this.cookies]
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
    return new Promise((resolve, reject) => {
      const req = request(
        {
          host: "127.0.0.1",
          port: PORT,
          servername: AUTH_HOST,
          ca: this.ca,
          method,
          path: route,
          headers,
        },
        (res) => {
          for (const cookie of res.headers["set-cookie"] ?? []) {
            const [pair = ""] = cookie.split(";");
            const at = pair.indexOf("=");
            this.cookies.set(pair.slice(0, at), pair.slice(at + 1));
          }
          let text = "";
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => (text += chunk));
          res.on("end", () =>
            resolve({
              status: res.statusCode ?? 0,
              location: res.headers.location,
              text,
            }),
          );
        },
      );
      req.on("error", reject);
      req.end(payload);
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(body: unknown): Record<string, unknown>[] {
  if (!Array.isArray(body) || !body.every(isRecord))
    throw new Error(`Not a list of objects: ${JSON.stringify(body)}`);
  return body;
}

function stringField(body: unknown, key: string): string {
  const value = isRecord(body) ? body[key] : undefined;
  if (typeof value !== "string")
    throw new Error(`No string ${key} in ${JSON.stringify(body)}`);
  return value;
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
