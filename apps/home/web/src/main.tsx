import "@mantine/core/styles.css";
import { MantineProvider } from "@mantine/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { Home } from "./home.ts";
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

const home = new Home(registerServiceWorker());
void home.start();

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root");
createRoot(root).render(
  <StrictMode>
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
      defaultColorScheme="auto"
    >
      <App home={home} />
    </MantineProvider>
  </StrictMode>,
);
