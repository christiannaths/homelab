import { defineConfig } from "vite";

// One standalone classic script, which Home serves and every app adds with a script tag. Classic
// rather than a module, since it reads its options from document.currentScript.
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
