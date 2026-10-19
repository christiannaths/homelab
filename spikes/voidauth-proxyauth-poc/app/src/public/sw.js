// Network first, so a signed-out person is sent to VoidAuth (the gateway's redirect passes
// straight through to the browser); the cached shell only answers when the network is down.
// A redirect on a page load means this browser is no longer let in, so everything the app kept
// on the device is deleted before the browser follows it.
const SHELL = "shell-v1";

addEventListener(
  "install",
  /** @param {ExtendableEvent} event */ (event) => {
    event.waitUntil(
      caches
        .open(SHELL)
        .then((cache) =>
          cache.addAll(["/", "/app.js", "/manifest.webmanifest"]),
        ),
    );
  },
);

addEventListener(
  "fetch",
  /** @param {FetchEvent} event */ (event) => {
    const url = new URL(event.request.url);
    if (
      event.request.method !== "GET" ||
      url.origin !== location.origin ||
      url.pathname.startsWith("/api/") ||
      url.pathname === "/sync"
    )
      return;
    event.respondWith(
      fetch(event.request).then(
        async (response) => {
          if (response.type === "opaqueredirect")
            for (const key of await caches.keys()) await caches.delete(key);
          return response;
        },
        async () => {
          const cached = await caches.match(event.request, {
            ignoreSearch: true,
          });
          return cached ?? Response.error();
        },
      ),
    );
  },
);
