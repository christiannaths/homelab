import "@mantine/core/styles.css";
import { MantineProvider } from "@mantine/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { askMe, isSignedOut, SIGN_IN_PATH } from "./api.ts";
import { parseMe } from "@homelab/app-switcher/me";
import { createSignedInState } from "@homelab/signed-in-state";
import { cssVariablesResolver, theme } from "@homelab/theme";

/** Settles once the service worker can start Home offline, or at once where there is none. */
function registerServiceWorker(): Promise<unknown> {
  // Vite's dev server has no service worker; it exists only in the production build.
  if (!import.meta.env.PROD || !("serviceWorker" in navigator))
    return Promise.resolve();
  return navigator.serviceWorker
    .register("/sw.js")
    .then(() => navigator.serviceWorker.ready)
    .catch(() => undefined);
}

const state = createSignedInState({
  ask: askMe,
  isSignedOut,
  read: parseMe,
  storageKey: "home.me",
  offlineReady: registerServiceWorker(),
  goToSignIn: () => location.replace(SIGN_IN_PATH),
});
void state.start();

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root");
createRoot(root).render(
  <StrictMode>
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
      defaultColorScheme="auto"
    >
      <App state={state} />
    </MantineProvider>
  </StrictMode>,
);
