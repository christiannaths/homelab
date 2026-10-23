import { defineConfig } from "vite";

// One standalone classic script, which the gateway puts inline into every page (ADR-PLAT-004).
// Classic rather than a module, so it runs wherever it is put.
export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["iife"],
      name: "homelabSwitcher",
      fileName: () => "switcher.js",
    },
  },
});
