import "@mantine/core/styles.css";
import { MantineProvider } from "@mantine/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { askSession, parsePerson, readSession, SIGN_IN_PATH } from "./api.ts";
import { createSignedInState } from "@homelab/signed-in-state";
import { cssVariablesResolver, theme } from "@homelab/theme";

/** Settles once the service worker can start the app offline, or at once where there is none. */
function registerServiceWorker(): Promise<unknown> {
  // Vite's dev server has no service worker; it exists only in the production build.
  if (!import.meta.env.PROD || !("serviceWorker" in navigator))
    return Promise.resolve();
  return navigator.serviceWorker
    .register("/sw.js")
    .then(() => navigator.serviceWorker.ready)
    .catch(() => undefined);
}

const offlineReady = registerServiceWorker();
// ADR-NOTE-003: ask the browser not to evict what Notes stores on this device.
navigator.storage?.persist?.().catch(() => undefined);

// Signing out is the App switcher's (ADR-NOTE-009).
const state = createSignedInState({
  ask: askSession,
  read: readSession,
  storageKey: "notes.person",
  readSaved: parsePerson,
  offlineReady,
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
