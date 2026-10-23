// The service-worker route that keeps the other apps' icons for the switcher's menu when an app
// opens offline (ADR-PLAT-004). Each offline-first app adds it to its Workbox config:
//
//   workbox: { runtimeCaching: switcherCaching }
//
// Workbox copies the function's source into the generated service worker, so it uses nothing
// from around it.
export const switcherCaching = [
  {
    // The other apps' icons in the menu; the app's own are in its precache already. They load
    // with CORS, which the gateway allows for icons, so only good answers are kept.
    urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
      !sameOrigin && url.pathname.startsWith("/icons/"),
    handler: "StaleWhileRevalidate" as const,
    options: {
      cacheName: "homelab-switcher-icons",
      cacheableResponse: { statuses: [200] },
      expiration: { maxEntries: 50 },
    },
  },
];
