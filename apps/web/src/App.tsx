import { useEffect, useMemo, useState } from "react";
import { Diagnostics } from "./components/Diagnostics";
import { PageView } from "./components/PageView";
import { Sidebar } from "./components/Sidebar";
import type { Identity } from "./identity";
import { useLocalReady, usePages, useSyncManager } from "./sync/context";
import { createPage, pageDocName, WORKSPACE_DOC } from "./sync/workspace";

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
  const pages = usePages(workspace.doc);
  const route = useHashRoute();

  // Keep every page on this device: open (and so persist and sync) every doc in the workspace.
  useEffect(() => {
    for (const p of pages) manager.open(pageDocName(p.id));
  }, [manager, pages]);

  const pageId = route.match(/^#\/page\/(.+)$/)?.[1] ?? null;
  const page = pages.find((p) => p.id === pageId);

  if (!ready) return <div className="boot">Opening workspace…</div>;

  return (
    <div className="layout">
      <Sidebar
        pages={pages}
        currentId={pageId}
        onCreate={() => {
          location.hash = `#/page/${createPage(workspace.doc)}`;
        }}
      />
      <main className="content">
        {route === "#/diagnostics" ? (
          <Diagnostics workspace={workspace.doc} />
        ) : page ? (
          <PageView key={page.id} page={page} workspace={workspace.doc} identity={identity} />
        ) : (
          <div className="empty">
            <p>{pages.length ? "Pick a page from the sidebar." : "No pages yet."}</p>
          </div>
        )}
      </main>
    </div>
  );
}
