import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import { loadIdentity, loadToken } from "./identity";
import { SyncContext } from "./sync/context";
import { SyncManager } from "./sync/SyncManager";
import "./styles.css";

registerSW({ immediate: true });
// Ask the browser not to evict our IndexedDB data under storage pressure.
navigator.storage?.persist?.().catch(() => {});

const wsUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/sync`;
const manager = new SyncManager(wsUrl, loadToken);
// Exposed for diagnostics and end-to-end tests.
(window as unknown as { __localnotion: SyncManager }).__localnotion = manager;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SyncContext.Provider value={manager}>
      <App identity={loadIdentity()} />
    </SyncContext.Provider>
  </StrictMode>,
);
