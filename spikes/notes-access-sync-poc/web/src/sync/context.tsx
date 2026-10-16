import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { buildTree, type Tree } from "@homelab/notes-access-sync-poc-model";
import type { LocalPages } from "./pages";
import type { DocEntry, SyncManager } from "./SyncManager";

export const SyncContext = createContext<SyncManager | null>(null);

export function useSyncManager(): SyncManager {
  const m = useContext(SyncContext);
  if (!m) throw new Error("SyncContext missing");
  return m;
}

export function useSyncSnapshot() {
  const m = useSyncManager();
  return useSyncExternalStore(m.subscribe, m.getSnapshot);
}

/** True once the doc's local copy is loaded, so the UI never waits on the network. */
export function useLocalReady(entry: DocEntry | undefined): boolean {
  const [ready, setReady] = useState(entry?.localLoadedAt !== undefined);
  useEffect(() => {
    if (!entry) return;
    let live = true;
    setReady(entry.localLoadedAt !== undefined);
    entry.whenLocal.then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [entry]);
  return ready;
}

/** The tree derived from the page documents on this device, rebuilt when any page's metadata changes. */
export function useTree(pages: LocalPages): Tree {
  const metas = useSyncExternalStore(pages.subscribe, pages.getSnapshot);
  return useMemo(() => buildTree(metas), [metas]);
}
