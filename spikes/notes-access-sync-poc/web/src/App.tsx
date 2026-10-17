import type { Person } from "@homelab/notes-access-sync-poc-model";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { PageView } from "./components/PageView";
import { PeopleView } from "./components/PeopleView";
import { Sidebar } from "./components/Sidebar";
import { colorFor } from "./identity";
import { useLocalReady, useSyncManager, useTree } from "./sync/context";
import { LostEdits } from "./sync/lostEdits";
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

interface Props {
  me: Person;
  onSwitchPerson: () => void;
  /** The server no longer knows this person: they were removed from the workspace. */
  onRemoved: () => void;
}

export function App({ me, onSwitchPerson, onRemoved }: Props) {
  const manager = useSyncManager();
  const lostEdits = useMemo(() => new LostEdits(manager.storeName("~lost-edits")), [manager]);
  // This person's page index and page documents. There is no workspace-wide tree document: the
  // sidebar is derived from the page documents this device received.
  const pages = useMemo(
    () => new LocalPages(manager, me.id, { onLostEdits: (id, update) => lostEdits.add(id, update), onRemoved }),
    [manager, me.id, lostEdits, onRemoved],
  );
  const ready = useLocalReady(pages.index);
  const tree = useTree(pages);
  const route = useHashRoute();
  const identity = useMemo(() => ({ name: me.name, color: colorFor(me) }), [me]);
  const lost = useSyncExternalStore(lostEdits.subscribe, lostEdits.getSnapshot);

  // Keep every page this person can open on this device, so all of it works offline.
  useEffect(() => pages.start(), [pages]);

  if (!ready) return <div className="boot">Opening workspace…</div>;

  const pageId = route.match(/^#\/page\/([^/]+)$/)?.[1] ?? null;
  // A page being deleted after losing access has no document any more.
  const node = pageId && pages.entry(pageId) ? tree.byId.get(pageId) : undefined;

  let content;
  if (route === "#/people") content = <PeopleView me={me} />;
  else if (node) content = <PageView key={node.page.id} page={node.page} pages={pages} tree={tree} identity={identity} me={me} />;
  else
    content = (
      <div className="empty">
        <p>{tree.roots.length ? "Pick a page from the sidebar." : "No pages yet."}</p>
      </div>
    );

  return (
    <div className="layout">
      <Sidebar pages={pages} tree={tree} currentId={node?.page.id ?? null} me={me} onSwitchPerson={onSwitchPerson} />
      <main className="content">
        {lost.map((item) => (
          <div className="notice" key={item.pageId} data-testid="lost-edits">
            <p>
              You lost access to “{item.title || "Untitled"}” before your edits on this device were synced. They
              are no longer on the page.
            </p>
            {/* Guests have no Private section. */}
            {me.role !== "guest" && (
              <button
                data-testid="lost-edits-keep"
                onClick={() => {
                  const id = lostEdits.keep(item, pages, tree, me.id);
                  location.hash = `#/page/${id}`;
                }}
              >
                Keep them as a Private page
              </button>
            )}{" "}
            <button className="link" data-testid="lost-edits-discard" onClick={() => lostEdits.discard(item)}>
              Discard
            </button>
          </div>
        ))}
        {content}
      </main>
    </div>
  );
}
