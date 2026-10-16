import type { Person } from "@homelab/notes-access-sync-poc-model";
import { useEffect, useMemo, useState } from "react";
import { PageView } from "./components/PageView";
import { PeopleView } from "./components/PeopleView";
import { Sidebar } from "./components/Sidebar";
import { colorFor } from "./identity";
import { useLocalReady, useSyncManager, useTree } from "./sync/context";
import { LocalPages } from "./sync/pages";

function useHashRoute(): string {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => setHash(location.hash);
    addEventListener("hashchange", onChange);
    return () => removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

export function App({ me, onSwitchPerson }: { me: Person; onSwitchPerson: () => void }) {
  const manager = useSyncManager();
  // This person's page index and page documents. There is no workspace-wide tree document: the
  // sidebar is derived from the page documents this device received.
  const pages = useMemo(() => new LocalPages(manager, me.id), [manager, me.id]);
  const ready = useLocalReady(pages.index);
  const tree = useTree(pages);
  const route = useHashRoute();
  const identity = useMemo(() => ({ name: me.name, color: colorFor(me) }), [me]);

  // Keep every page this person can open on this device, so all of it works offline.
  useEffect(() => pages.start(), [pages]);

  if (!ready) return <div className="boot">Opening workspace…</div>;

  const pageId = route.match(/^#\/page\/([^/]+)$/)?.[1] ?? null;
  const node = pageId ? tree.byId.get(pageId) : undefined;

  let content;
  if (route === "#/people") content = <PeopleView me={me} />;
  else if (node) content = <PageView key={node.page.id} page={node.page} pages={pages} identity={identity} me={me} />;
  else
    content = (
      <div className="empty">
        <p>{tree.roots.length ? "Pick a page from the sidebar." : "No pages yet."}</p>
      </div>
    );

  return (
    <div className="layout">
      <Sidebar pages={pages} tree={tree} currentId={node?.page.id ?? null} me={me} onSwitchPerson={onSwitchPerson} />
      <main className="content">{content}</main>
    </div>
  );
}
