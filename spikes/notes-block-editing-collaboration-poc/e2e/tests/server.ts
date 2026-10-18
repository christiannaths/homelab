import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// The Notes app directory (spikes/notes-block-editing-collaboration-poc).
const root = path.resolve(import.meta.dirname, "../..");
let nextPort = 3200;

export class TestServer {
  readonly url: string;
  private proc: ChildProcess | null = null;
  /** Server output, kept so tests can assert on warnings (e.g. dropped connections). */
  readonly logs: string[] = [];

  constructor(
    readonly port = nextPort++,
    readonly dataDir = mkdtempSync(path.join(tmpdir(), "localnotion-")),
  ) {
    this.url = `http://localhost:${port}`;
  }

  async start(): Promise<void> {
    this.proc = spawn(
      "node",
      ["--no-experimental-webstorage", "server/dist/index.js"],
      {
        cwd: root,
        env: {
          ...process.env,
          PORT: String(this.port),
          DATA_DIR: this.dataDir,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    for (const stream of [this.proc.stdout!, this.proc.stderr!]) {
      stream.on("data", (chunk: Buffer) => {
        process.stdout.write(chunk);
        this.logs.push(...chunk.toString().split("\n").filter(Boolean));
      });
    }
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`${this.url}/api/health`)).ok) return;
      } catch {
        // not up yet
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("server did not start");
  }

  async stop(): Promise<void> {
    const proc = this.proc;
    if (!proc || proc.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      proc.once("exit", () => resolve());
      proc.kill("SIGTERM");
    });
    this.proc = null;
  }

  async health(): Promise<Health> {
    const body: unknown = await (await fetch(`${this.url}/api/health`)).json();
    return parseHealth(body);
  }
}

type Health = { ok: boolean; documents: number };

function parseHealth(value: unknown): Health {
  if (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    typeof value.ok === "boolean" &&
    "documents" in value &&
    typeof value.documents === "number"
  ) {
    return { ok: value.ok, documents: value.documents };
  }
  throw new Error(`unexpected /api/health response: ${JSON.stringify(value)}`);
}
