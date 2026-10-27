import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { tokens } from "@homelab/theme/tokens";

declare module "vite-plugin-pwa" {
  interface ManifestOptions {
    /** Homelab's own manifest member, which Home reads (ADR-PLAT-004). */
    homelab?: { opens_offline?: boolean };
  }
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: "home-theme-color",
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
        name: "Home",
        short_name: "Home",
        description: "Every app on your homelab",
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
        // The whole app shell, so Home starts with no network.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//],
        // The first visit is controlled at once, so the tiles' icons are kept from then on.
        clientsClaim: true,
        runtimeCaching: [
          {
            // The other apps' icons on the tiles; Home's own are in its precache already. They
            // load with CORS, which the gateway allows for icons, so only good answers are kept.
            urlPattern: ({ url, sameOrigin }) =>
              !sameOrigin && url.pathname.startsWith("/icons/"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "home-tile-icons",
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 50 },
            },
          },
        ],
      },
    }),
  ],
});
