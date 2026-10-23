// The App switcher's script, which the gateway puts inline into every page of every app
// (ADR-PLAT-004). It adds the tab at the top of the page, which has no options: every app gets
// the same one.
import { HomelabSwitcher } from "./element.ts";
import { current } from "./store.ts";

const NAME = "homelab-switcher";

// VoidAuth, at accounts. (ADR-PLAT-004), asks "add a passkey?" after every sign-in on a browser
// until the person skips it, which it remembers here. It has no setting for it, so the switcher
// skips it for everyone: passkeys are added from Account settings.
if (location.hostname.startsWith("accounts.")) {
  try {
    if (!localStorage.getItem("passkey_skipped"))
      localStorage.setItem("passkey_skipped", new Date().toString());
  } catch {
    // Storage can be unavailable (a private window, blocked site data); VoidAuth then asks.
  }
}

if (!customElements.get(NAME)) {
  customElements.define(NAME, HomelabSwitcher);
  // Beside <body> rather than in it, so an app that replaces its body's contents keeps the tab.
  document.documentElement.append(document.createElement(NAME));
}

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
