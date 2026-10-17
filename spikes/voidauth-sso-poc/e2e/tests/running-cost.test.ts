// Question 6 (running cost) and the theming question: measured on the running container.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, inject, it } from "vitest";
import { compose, VOIDAUTH_URL } from "./voidauth.ts";

const run = promisify(execFile);
const env = inject("composeEnv");

describe("running cost", () => {
  it("reports the container's memory and the image's size", async () => {
    const container = (await compose(env, "ps", "--quiet", "voidauth")).trim();
    const { stdout: memory } = await run("docker", ["stats", "--no-stream", "--format", "{{.MemUsage}}", container]);
    const { stdout: image } = await run("docker", ["image", "inspect", "--format", "{{.Size}}", "voidauth/voidauth:1.16.0"]);
    const imageMb = Number(image.trim()) / 1e6;
    console.log(`VoidAuth memory: ${memory.trim()}; image on disk: ${imageMb.toFixed(0)} MB`);
    expect(imageMb).toBeLessThan(400);
  });
});

describe("theming", () => {
  it("follows the system light or dark mode, with one theme color and a custom.css", async () => {
    const page = await (await fetch(`${VOIDAUTH_URL}/`)).text();
    expect(page).toContain('href="generated-mat-theme.css"');
    expect(page).toContain('href="custom.css"');
    const theme = await (await fetch(`${VOIDAUTH_URL}/generated-mat-theme.css`)).text();
    expect(theme).toContain("color-scheme: light dark");
    expect(theme).toMatch(/--mat-sys-primary: light-dark\(#\w+, #\w+\)/);
    expect(await (await fetch(`${VOIDAUTH_URL}/custom.css`)).text()).toContain("Put custom CSS here");
  });
});
