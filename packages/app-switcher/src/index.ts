// The App switcher's script, which the gateway puts inline into every page of every app
// (ADR-PLAT-004). It draws itself in the <homelab-switcher> an app puts in its header.
import { HomelabSwitcher } from "./element.ts";
import { current } from "./store.ts";

const NAME = "homelab-switcher";

if (!customElements.get(NAME)) customElements.define(NAME, HomelabSwitcher);

// On the first visit the icons load before the app's service worker controls the page, so it has
// no copy of them for opening offline (caching.ts). They are asked for again once it does.
navigator.serviceWorker?.addEventListener("controllerchange", () => {
  const state = current();
  const icons =
    state.status === "signed-in"
      ? state.me.apps.flatMap((app) => (app.icon ? [app.icon] : []))
      : [];
  // Each is asked for as the menu asks, so the copy kept is the one the menu gets offline.
  for (const icon of icons)
    void fetch(icon, { mode: "cors", credentials: "same-origin" }).catch(
      () => undefined,
    );
});
