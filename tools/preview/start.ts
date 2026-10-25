// The preview image's entrypoint (ADR-PLAT-008): runs the whole homelab in one container, since Fly
// mounts a volume into only one container per machine. It starts the gateway, the accounts
// service, the Home and Notes servers, with all their data under DATA_DIR, then loads the test
// people. Loading again on a later start only adds the people missing, so data survives restarts.
//
//   node tools/preview/start.ts         run the preview until stopped
//   node tools/preview/start.ts reset   wipe the running preview's data and start it fresh
import { spawn, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { connect } from "node:net";
import path from "node:path";
import { INSTALLED_APPS, LOAD_TEST_PEOPLE, PEOPLE } from "../test-people.ts";

const ROOT = path.join(import.meta.dirname, "..", "..");
/** The volume. */
const DATA_DIR = "/data";
const PORT = Number(process.env.PORT ?? 8080);
/** Holds the running preview's process id, for `reset` to signal. */
const PID_FILE = "/tmp/preview.pid";
/** Written once the test people are loaded, so `reset` knows when the fresh preview is up. */
const READY_FILE = path.join(DATA_DIR, "ready");

function setting(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Set ${name}.`);
    process.exit(1);
  }
  return value;
}

interface Running {
  stop(): Promise<void>;
}

/** Starts every service and loads the test people. Fails when a service won't come up. */
async function startPreview(onExit: (name: string) => void): Promise<Running> {
  const domain = `${setting("PREVIEW_NAME")}.${setting("PREVIEW_DOMAIN")}`;
  const accountsUrl = `https://accounts.${domain}`;
  // A volume with no accounts data holds another sign-in service's people, whose Notes data
  // would belong to no one, so the preview starts fresh.
  if (!existsSync(path.join(DATA_DIR, "accounts"))) wipeData();
  for (const dir of ["accounts", "notes", "caddy"])
    mkdirSync(path.join(DATA_DIR, dir), { recursive: true });

  const children: { name: string; child: ChildProcess }[] = [];
  const run = (
    name: string,
    command: string,
    args: string[],
    options: { cwd: string; env: Record<string, string> },
  ): ChildProcess => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "inherit"],
    });
    child.stdout?.pipe(process.stdout);
    const entry = { name, child };
    children.push(entry);
    child.on("exit", () => {
      if (children.includes(entry)) onExit(name);
    });
    return child;
  };

  // The gateway starts first and alone, so a request that wakes a stopped machine reaches it within
  // Fly's proxy's few seconds of patience. It holds requests until the accounts service, Home and
  // Notes are up (Caddyfile).
  run(
    "the gateway",
    "caddy",
    ["run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"],
    {
      cwd: "/",
      env: {
        SITE_DOMAIN: domain,
        PORT: String(PORT),
        ACCOUNTS_UPSTREAM: "127.0.0.1:3000",
        XDG_DATA_HOME: path.join(DATA_DIR, "caddy"),
        XDG_CONFIG_HOME: path.join(DATA_DIR, "caddy"),
      },
    },
  );
  await listening(PORT);

  const accountsEnv = {
    // The session cookie goes on the preview's domain, so its apps share it and no other
    // preview's do.
    HOMELAB_DOMAIN: domain,
    ACCOUNTS_URL: accountsUrl,
    ACCOUNTS_SECRET: setting("ACCOUNTS_SECRET"),
    HOMELAB_APPS: INSTALLED_APPS,
    DATA_DIR: path.join(DATA_DIR, "accounts"),
    PORT: "3000",
    // The account page reads each app's manifest from the gateway in this container, as Home does.
    GATEWAY_URL: `http://127.0.0.1:${PORT}`,
  };
  run(
    "the accounts service",
    process.execPath,
    ["--no-experimental-webstorage", "apps/accounts/server/src/index.ts"],
    { cwd: ROOT, env: accountsEnv },
  );

  // Home reads each app's manifest from the gateway in this container, over plain HTTP like
  // Fly's proxy.
  run("Home", process.execPath, ["apps/home/server/src/index.ts"], {
    cwd: ROOT,
    env: {
      HOMELAB_URL: `https://${domain}`,
      GATEWAY_URL: `http://127.0.0.1:${PORT}`,
      PORT: "3002",
    },
  });

  run(
    "Notes",
    process.execPath,
    ["--no-experimental-webstorage", "apps/notes/server/src/index.ts"],
    {
      cwd: ROOT,
      env: {
        PORT: "3001",
        DATA_DIR: path.join(DATA_DIR, "notes"),
      },
    },
  );

  const stop = async () => {
    const stopping = children.splice(0);
    await Promise.all(
      stopping.map(
        ({ child }) =>
          new Promise<void>((resolve) => {
            if (child.exitCode !== null || child.signalCode !== null)
              return resolve();
            child.once("exit", () => resolve());
            child.kill("SIGTERM");
          }),
      ),
    );
  };

  try {
    // After the service has made its tables, so the loader never makes them at the same time.
    await listening(3000);
    await loadTestPeople(accountsEnv);
  } catch (error) {
    await stop();
    throw error;
  }
  writeFileSync(READY_FILE, new Date().toISOString());
  console.log(`The preview is up at ${accountsUrl}/`);
  return { stop };
}

/** Makes the test people who are missing, with the accounts service's own loader. */
async function loadTestPeople(env: Record<string, string>): Promise<void> {
  const loader = spawn(process.execPath, LOAD_TEST_PEOPLE, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ["pipe", "ignore", "inherit"],
  });
  loader.stdin.end(JSON.stringify(PEOPLE));
  const code = await new Promise<number | null>((resolve) =>
    loader.on("exit", resolve),
  );
  if (code !== 0) throw new Error(`Loading the test people failed (${code})`);
}

/** Waits until something accepts connections on the port, on this machine. */
async function listening(port: number): Promise<void> {
  for (let i = 0; i < 100; i++) {
    const open = await new Promise<boolean>((resolve) => {
      const socket = connect(port, "127.0.0.1", () => {
        socket.end();
        resolve(true);
      });
      socket.on("error", () => resolve(false));
    });
    if (open) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Nothing listened on port ${port} within 10 seconds`);
}

/** Deletes everything under DATA_DIR but the folder itself, which may be a volume's mount point. */
function wipeData(): void {
  for (const entry of readdirSync(DATA_DIR))
    rmSync(path.join(DATA_DIR, entry), { recursive: true, force: true });
}

async function serve(): Promise<void> {
  writeFileSync(PID_FILE, String(process.pid));
  let running: Running | undefined;
  let resetting = false;
  // A service that stops on its own takes the preview down, so Fly restarts the machine.
  const onExit = (name: string) => {
    console.error(`${name} stopped, so the preview stops too.`);
    void (running?.stop() ?? Promise.resolve()).then(() => process.exit(1));
  };

  process.on("SIGUSR2", () => {
    if (resetting) return;
    resetting = true;
    console.log("Resetting the preview: deleting its data…");
    void (async () => {
      await running?.stop();
      running = undefined;
      wipeData();
      running = await startPreview(onExit);
      resetting = false;
    })().catch((error: unknown) => {
      console.error(`Resetting failed: ${String(error)}`);
      process.exit(1);
    });
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      void (running?.stop() ?? Promise.resolve()).then(() => process.exit(0));
    });

  running = await startPreview(onExit);
}

/** Asks the running preview to reset, and waits until it is up again with fresh data. */
async function reset(): Promise<void> {
  if (!existsSync(PID_FILE)) {
    console.error("No preview is running in this container.");
    process.exit(1);
  }
  const before = existsSync(READY_FILE) ? statSync(READY_FILE).mtimeMs : 0;
  process.kill(Number(readFileSync(PID_FILE, "utf8")), "SIGUSR2");
  for (let i = 0; i < 240; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (existsSync(READY_FILE) && statSync(READY_FILE).mtimeMs > before) {
      console.log("The preview was reset: only the test people are left.");
      return;
    }
  }
  console.error("The preview did not come back within 2 minutes of resetting.");
  process.exit(1);
}

const command = process.argv[2] ?? "start";
if (command === "start") {
  await serve();
} else if (command === "reset") {
  await reset();
} else {
  console.error(`Unknown command ${command}. Use start or reset.`);
  process.exit(1);
}
