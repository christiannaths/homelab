import { useEffect, useMemo, useState } from "react";
import { DatabaseView } from "./components/DatabaseView";
import { Diagnostics } from "./components/Diagnostics";
import { PageView } from "./components/PageView";
import { RowPage } from "./components/RowPage";
import { Sidebar } from "./components/Sidebar";
import { TrashView } from "./components/TrashView";
import type { Identity } from "./identity";
import { useLocalReady, useSyncManager, useTree } from "./sync/context";
import { keepWorkspaceLocal } from "./sync/keep-local";
import { WORKSPACE_DOC } from "./sync/workspace";

function useHashRoute(): string {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => setHash(location.hash);
    addEventListener("hashchange", onChange);
    return () => removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

export function App({ identity }: { identity: Identity }) {
  const manager = useSyncManager();
  const workspace = useMemo(() => manager.open(WORKSPACE_DOC), [manager]);
  const ready = useLocalReady(workspace);
  const tree = useTree(workspace.doc);
  const route = useHashRoute();

  // Keep every page, database and row body on this device, so all of it works offline.
  useEffect(
    () => keepWorkspaceLocal(manager, workspace.doc),
    [manager, workspace],
  );

  if (!ready) return <div className="boot">Opening workspace…</div>;

  const pageId = route.match(/^#\/page\/([^/]+)$/)?.[1] ?? null;
  const rowRoute = route.match(/^#\/row\/([^/]+)\/([^/]+)$/);
  const node = pageId
    ? tree.byId.get(pageId)
    : rowRoute
      ? tree.byId.get(rowRoute[1])
      : undefined;

  let content;
  if (route === "#/diagnostics")
    content = (
      <Diagnostics
        workspace={workspace.doc}
        tree={tree}
      />
    );
  else if (route === "#/trash")
    content = (
      <TrashView
        workspace={workspace.doc}
        tree={tree}
      />
    );
  else if (rowRoute && node?.page.kind === "database")
    content = (
      <RowPage
        key={rowRoute[2]}
        database={node.page}
        rowId={rowRoute[2]}
        identity={identity}
      />
    );
  else if (node?.page.kind === "database")
    content = (
      <DatabaseView
        key={node.page.id}
        page={node.page}
        workspace={workspace.doc}
      />
    );
  else if (node)
    content = (
      <PageView
        key={node.page.id}
        page={node.page}
        workspace={workspace.doc}
        identity={identity}
      />
    );
  else
    content = (
      <div className="empty">
        <p>
          {tree.roots.length
            ? "Pick a page from the sidebar."
            : "No pages yet."}
        </p>
      </div>
    );

  return (
    <div className="layout">
      <Sidebar
        workspace={workspace.doc}
        tree={tree}
        currentId={node?.page.id ?? null}
      />
      <main className="content">{content}</main>
    </div>
  );
}
