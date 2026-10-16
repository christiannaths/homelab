import { pageDocName, pagesMap } from "@homelab/notes-access-sync-poc-model";
import type * as Y from "yjs";
import type { SyncManager } from "./SyncManager";

/**
 * Keeps a full copy of the workspace on this device: opens (and so persists and syncs) every
 * page doc the workspace doc lists, trashed ones included so they can be restored offline.
 * Returns a function that stops watching.
 */
export function keepWorkspaceLocal(manager: SyncManager, workspace: Y.Doc): () => void {
  const pages = pagesMap(workspace);
  const sync = () => pages.forEach((_, id) => manager.open(pageDocName(id)));
  sync();
  pages.observeDeep(sync);
  return () => pages.unobserveDeep(sync);
}
