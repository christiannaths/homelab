import type * as Y from "yjs";
import { rowsMap } from "../model/database";
import type { SyncManager } from "./SyncManager";
import { databaseDocName, pageDocName, pagesMap } from "./workspace";

/**
 * Keeps a full copy of the workspace on this device: opens (and so persists and
 * syncs) every page doc, every database doc, and every database row that has a
 * page body. Trashed pages are included so they can be restored offline.
 * Returns a function that stops watching.
 */
export function keepWorkspaceLocal(manager: SyncManager, workspace: Y.Doc): () => void {
  const watchedDbs = new Map<string, () => void>();

  const watchDatabase = (dbId: string) => {
    if (watchedDbs.has(dbId)) return;
    const rows = rowsMap(manager.open(databaseDocName(dbId)).doc);
    const openBodies = () => {
      rows.forEach((row, rowId) => {
        if (row.get("_hasBody")) manager.open(pageDocName(rowId));
      });
    };
    openBodies();
    rows.observeDeep(openBodies);
    watchedDbs.set(dbId, () => rows.unobserveDeep(openBodies));
  };

  const pages = pagesMap(workspace);
  const sync = () => {
    pages.forEach((m, id) => {
      if (m.get("kind") === "database") watchDatabase(id);
      else manager.open(pageDocName(id));
    });
  };
  sync();
  pages.observeDeep(sync);
  return () => {
    pages.unobserveDeep(sync);
    for (const stop of watchedDbs.values()) stop();
  };
}
