import * as Y from "yjs";

/**
 * The names of the top-level shared types (`meta`, `content`, `access`, …) that `update` would
 * change if it were applied to `doc`. Deletions count, and so do changes nested anywhere below a
 * top-level type. An update `doc` already has touches nothing.
 *
 * It applies the update to a scratch copy, so `doc` is left alone: the server calls it before
 * deciding whether to apply an update at all. That costs one copy of the document per checked
 * update, so the server only checks connections that may not change everything (below Full).
 * Updates whose dependencies haven't arrived yet are carried in the copy (`encodeStateAsUpdate`
 * includes pending structs), so they are checked when the update that completes them arrives.
 *
 * To check deeper than the top level (Can edit content on a database), walk `changed` the same
 * way and report the path below the root instead of just its name.
 */
export function touchedRoots(doc: Y.Doc, update: Uint8Array): Set<string> {
  const { touched, copy } = previewUpdate(doc, update);
  copy.destroy();
  return touched;
}

/**
 * `touchedRoots`, plus the scratch copy of `doc` with `update` applied, for checks that need the
 * result (where a new page would be placed). The caller must destroy `copy`.
 */
export function previewUpdate(doc: Y.Doc, update: Uint8Array): { touched: Set<string>; copy: Y.Doc } {
  const copy = new Y.Doc();
  Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
  const touched = new Set<Y.AbstractType<any>>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  copy.on("afterTransaction", (transaction: Y.Transaction) => {
    for (const type of transaction.changed.keys()) {
      let root = type;
      while (root._item) root = root._item.parent as typeof root;
      touched.add(root);
    }
  });
  Y.applyUpdate(copy, update);
  const names = new Set<string>();
  for (const [name, type] of copy.share) if (touched.has(type)) names.add(name);
  return { touched: names, copy };
}
