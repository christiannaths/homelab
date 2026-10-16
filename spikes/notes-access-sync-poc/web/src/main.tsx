import type { Person } from "@homelab/notes-access-sync-poc-model";
import { StrictMode, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import { PersonPicker } from "./components/PersonPicker";
import { loadPerson, savePerson } from "./identity";
import { SyncContext } from "./sync/context";
import { SyncManager } from "./sync/SyncManager";
import "./styles.css";

registerSW({ immediate: true });
// Ask the browser not to evict our IndexedDB data under storage pressure.
navigator.storage?.persist?.().catch(() => {});

const wsUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/sync`;

// One sync manager for the page's lifetime, created once a person is picked (outside React, so
// StrictMode's double render doesn't open two sockets). Switching person reloads the page.
let manager: SyncManager | null = null;
function managerFor(person: Person): SyncManager {
  manager ??= new SyncManager(wsUrl, person.id);
  // Exposed for diagnostics and end-to-end tests.
  (window as unknown as { __notesSync: SyncManager }).__notesSync = manager;
  return manager;
}

function Root() {
  const [me, setMe] = useState<Person | null>(loadPerson);
  const manager = useMemo(() => (me ? managerFor(me) : null), [me]);

  if (!me || !manager) {
    return (
      <PersonPicker
        onPick={(person) => {
          savePerson(person);
          setMe(person);
        }}
      />
    );
  }
  return (
    <SyncContext.Provider value={manager}>
      <App
        me={me}
        onSwitchPerson={() => {
          savePerson(null);
          location.hash = "";
          location.reload();
        }}
      />
    </SyncContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
