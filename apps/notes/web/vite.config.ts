import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { switcherCaching } from "@homelab/app-switcher/caching";
import { tokens } from "@homelab/theme/tokens";

declare module "vite-plugin-pwa" {
  interface ManifestOptions {
    /** Homelab's own manifest member, which Home reads (ADR-PLAT-004). */
    homelab?: { opens_offline?: boolean };
  }
}

// The Notes server's address in development; it serves the API and the sync socket.
const server = process.env.NOTES_SERVER ?? "http://localhost:3000";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "notes-theme-color",
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
      // src/main.tsx registers the service worker itself, so it can wait for it before leaving
      // for the sign-in page.
      injectRegister: false,
      registerType: "autoUpdate",
      includeAssets: ["icons/icon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Notes",
        short_name: "Notes",
        description: "Offline-first notes for your homelab",
        display: "standalone",
        start_url: "/",
        background_color: tokens.surface.light,
        theme_color: tokens.surface.light,
        homelab: { opens_offline: true },
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // ADR-NOTE-003: the whole app shell, so the app starts with no network.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/sync/],
        // The first visit is controlled at once, so the App switcher's icons are kept from then
        // on (packages/app-switcher/src/caching.ts).
        clientsClaim: true,
        runtimeCaching: switcherCaching,
      },
    }),
  ],
  server: {
    proxy: {
      "/api": server,
      "/sync": { target: server.replace(/^http/, "ws"), ws: true },
    },
  },
});
