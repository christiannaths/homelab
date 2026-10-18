import "@mantine/core/styles.css";
import { MantineProvider } from "@mantine/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { Notes } from "./notes.ts";
import { theme } from "./theme.ts";

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

const notes = new Notes(offlineReady);
void notes.start();

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root");
createRoot(root).render(
  <StrictMode>
    <MantineProvider
      theme={theme}
      defaultColorScheme="auto"
    >
      <App notes={notes} />
    </MantineProvider>
  </StrictMode>,
);
