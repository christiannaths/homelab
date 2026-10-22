// The service-worker routes that let the switcher show when an app opens offline (ADR-PLAT-004).
// Each offline-first app adds them to its Workbox config:
//
//   workbox: { runtimeCaching: switcherCaching }
//
// Workbox copies each function's source into the generated service worker, so they use nothing
// from around them.
export const switcherCaching = [
  {
    // The script tag's same-origin address, which the gateway sends on to Home's copy.
    urlPattern: ({ url }: { url: URL }) =>
      url.pathname === "/_homelab/switcher.js",
    handler: "NetworkFirst" as const,
    options: {
      cacheName: "homelab-switcher",
      networkTimeoutSeconds: 3,
      // The script tag asks with CORS, so Home's answer has a status: a gateway error or a Home
      // that is down is a failure, which falls back to the kept copy instead of replacing it.
      cacheableResponse: { statuses: [200] },
      // Home's answer varies by Origin, which a page sends for its tag but not for the copy
      // asked for in index.ts; every request here comes from the one app's origin anyway.
      matchOptions: { ignoreVary: true },
      plugins: [
        {
          fetchDidSucceed: async ({ response }: { response: Response }) => {
            if (!response.ok)
              throw new Error(`Home answered ${response.status}`);
            return response;
          },
        },
      ],
    },
  },
  {
    // The other apps' icons in the menu; the app's own are in its precache already. They load
    // without CORS, so their answers are opaque and kept whatever they were, until the next
    // online load replaces them.
    urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
      !sameOrigin && url.pathname.startsWith("/icons/"),
    handler: "StaleWhileRevalidate" as const,
    options: {
      cacheName: "homelab-switcher-icons",
      cacheableResponse: { statuses: [0, 200] },
      expiration: { maxEntries: 50 },
    },
  },
];
