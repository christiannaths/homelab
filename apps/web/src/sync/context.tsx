import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import type * as Y from "yjs";
import type { DocEntry, SyncManager } from "./SyncManager";
import { readPages, type PageMeta } from "./workspace";

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

export function usePages(doc: Y.Doc): PageMeta[] {
  const [pages, setPages] = useState(() => readPages(doc));
  useEffect(() => {
    const update = () => setPages(readPages(doc));
    update();
    const map = doc.getMap("pages");
    map.observeDeep(update);
    return () => map.unobserveDeep(update);
  }, [doc]);
  return pages;
}
