import type { Person } from "@homelab/notes-access-sync-poc-model";
import { StrictMode, useCallback, useMemo, useState } from "react";
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

const NOTICE_KEY = "notes-access.notice";

/**
 * Leaves the current person: deletes everything of theirs from this device (their pages are not
 * someone else's to keep, #21), forgets who the device is, and starts again at the picker.
 */
async function signOut(manager: SyncManager, notice?: string): Promise<void> {
  await manager.wipe();
  savePerson(null);
  try {
    if (notice) sessionStorage.setItem(NOTICE_KEY, notice);
  } catch {
    // The picker just won't explain why.
  }
  location.hash = "";
  location.reload();
}

function takeNotice(): string | null {
  try {
    const notice = sessionStorage.getItem(NOTICE_KEY);
    sessionStorage.removeItem(NOTICE_KEY);
    return notice;
  } catch {
    return null;
  }
}

function Root() {
  const [me, setMe] = useState<Person | null>(loadPerson);
  const [notice] = useState(takeNotice);
  const manager = useMemo(() => (me ? managerFor(me) : null), [me]);
  const onRemoved = useCallback(() => {
    if (manager) void signOut(manager, "You were removed from the workspace, so its pages were deleted from this device.");
  }, [manager]);
  const onSwitchPerson = useCallback(() => {
    if (!manager) return;
    const pending = manager.getSnapshot().pendingChanges;
    if (pending > 0 && !confirm(`${pending} change(s) haven't synced yet and will be lost. Switch anyway?`)) return;
    void signOut(manager);
  }, [manager]);

  if (!me || !manager) {
    return (
      <PersonPicker
        notice={notice}
        onPick={(person) => {
          savePerson(person);
          setMe(person);
        }}
      />
    );
  }
  return (
    <SyncContext.Provider value={manager}>
      <App me={me} onSwitchPerson={onSwitchPerson} onRemoved={onRemoved} />
    </SyncContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
