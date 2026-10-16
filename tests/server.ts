import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
let nextPort = 3200;

export class TestServer {
  readonly url: string;
  private proc: ChildProcess | null = null;

  constructor(
    readonly port = nextPort++,
    readonly dataDir = mkdtempSync(path.join(tmpdir(), "localnotion-")),
  ) {
    this.url = `http://localhost:${port}`;
  }

  async start(): Promise<void> {
    this.proc = spawn("node", ["--no-experimental-webstorage", "apps/server/dist/index.js"], {
      cwd: root,
      env: { ...process.env, PORT: String(this.port), DATA_DIR: this.dataDir },
      stdio: "inherit",
    });
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

  async health(): Promise<{ ok: boolean; documents: number }> {
    return (await fetch(`${this.url}/api/health`)).json();
  }
}
