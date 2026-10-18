import type * as Y from "yjs";
import type { Tree } from "../model/tree";
import { restorePage } from "../sync/workspace";

export function TrashView({
  workspace,
  tree,
}: {
  workspace: Y.Doc;
  tree: Tree;
}) {
  return (
    <article className="page">
      <h1>Trash</h1>
      {tree.trash.length === 0 && (
        <p className="muted">Nothing in the trash.</p>
      )}
      <ul
        className="trash-list"
        data-testid="trash-list"
      >
        {tree.trash.map((p) => (
          <li key={p.id}>
            <span>{p.title || "Untitled"}</span>
            <button
              className="side-action"
              onClick={() => restorePage(workspace, tree, p.id)}
              data-testid="restore"
            >
              Restore
            </button>
          </li>
        ))}
      </ul>
    </article>
  );
}
