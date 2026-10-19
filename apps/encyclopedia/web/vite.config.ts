import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { tokens } from "./src/tokens.ts";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "encyclopedia-theme-color",
      transformIndexHtml: () =>
        (["light", "dark"] as const).map((scheme) => ({
          tag: "meta",
          attrs: {
            name: "theme-color",
            media: `(prefers-color-scheme: ${scheme})`,
            content: tokens.surface[scheme],
          },
          injectTo: "head",
        })),
    },
    VitePWA({
      injectRegister: false,
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Encyclopedia",
        short_name: "Encyclopedia",
        description: "Wikipedia, kept on your homelab",
        display: "standalone",
        start_url: "/",
        background_color: tokens.surface.light,
        theme_color: tokens.surface.light,
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // ADR-ENCY-005: the whole app shell, so the app starts with no network.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
});
