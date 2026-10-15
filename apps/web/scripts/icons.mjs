// Renders public/icon.svg to the PNG sizes iOS and the web manifest need.
// Uses the Playwright Chromium that's already a dev dependency, so no image libraries are needed.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), "../public");
const sizes = { "icon-192.png": 192, "icon-512.png": 512, "apple-touch-icon.png": 180 };
if (Object.keys(sizes).every((f) => existsSync(path.join(pub, f)))) process.exit(0);

const svg = readFileSync(path.join(pub, "icon.svg"), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size] of Object.entries(sizes)) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`,
  );
  await page.screenshot({ path: path.join(pub, file), omitBackground: true });
}
await browser.close();
