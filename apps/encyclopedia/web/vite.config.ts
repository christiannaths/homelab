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
      includeAssets: ["icons/icon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Encyclopedia",
        short_name: "Encyclopedia",
        description: "Wikipedia, kept on your homelab",
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
        // ADR-ENCY-005: the whole app shell, so the app starts with no network.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//],
        // The first visit is controlled at once, so the App switcher's script and icons are kept
        // from then on (packages/app-switcher/src/caching.ts).
        clientsClaim: true,
        runtimeCaching: switcherCaching,
      },
    }),
  ],
});
