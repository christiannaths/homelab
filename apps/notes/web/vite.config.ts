import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// The Notes server's address in development; it serves the API and the sync socket.
const server = process.env.NOTES_SERVER ?? "http://localhost:3000";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // src/main.tsx registers the service worker itself, so it can wait for it before leaving
      // for the sign-in page.
      injectRegister: false,
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Notes",
        short_name: "Notes",
        description: "Offline-first notes for your homelab",
        display: "standalone",
        start_url: "/",
        background_color: "#ffffff",
        theme_color: "#ffffff",
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
        // ADR-NOTE-003: the whole app shell, so the app starts with no network.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/sync/],
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
