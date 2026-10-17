import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type * as Y from "yjs";
import {
  readRows,
  readSchema,
  readView,
  rowsMap,
  schemaMap,
  viewsMap,
  type Property,
  type Row,
  type ViewConfig,
} from "../model/database";
import { buildTree, type Tree } from "../model/tree";
import type { DocEntry, SyncManager } from "./sync-manager";
import { pagesMap, readPages } from "./workspace";

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

/** Re-reads `read(doc)` whenever any of the given shared types change. */
function useYState<T>(
  doc: Y.Doc,
  types: (doc: Y.Doc) => Y.AbstractType<any>[],
  read: (doc: Y.Doc) => T,
): T {
  const [state, setState] = useState(() => read(doc));
  useEffect(() => {
    const update = () => setState(read(doc));
    update();
    const observed = types(doc);
    for (const t of observed) t.observeDeep(update);
    return () => {
      for (const t of observed) t.unobserveDeep(update);
    };
    // `types` and `read` are module-level functions, so only `doc` can change.
  }, [doc]);
  return state;
}

const workspaceTypes = (doc: Y.Doc) => [pagesMap(doc)];

export function useTree(doc: Y.Doc): Tree {
  const pages = useYState(doc, workspaceTypes, readPages);
  return useMemo(() => buildTree(pages), [pages]);
}

export interface DatabaseState {
  schema: Property[];
  rows: Row[];
  view: ViewConfig;
  /** Time spent re-reading the database doc on the last change. */
  readMs: number;
}

const databaseTypes = (doc: Y.Doc) => [
  schemaMap(doc),
  rowsMap(doc),
  viewsMap(doc),
];
const readDatabase = (doc: Y.Doc): DatabaseState => {
  const started = performance.now();
  const state = {
    schema: readSchema(doc),
    rows: readRows(doc),
    view: readView(doc),
  };
  return { ...state, readMs: performance.now() - started };
};

export function useDatabase(doc: Y.Doc): DatabaseState {
  return useYState(doc, databaseTypes, readDatabase);
}
