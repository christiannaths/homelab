import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { withCollaboration } from "@blocknote/core/yjs";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import {
  breadcrumb, canEdit, canShare, movePage, movesToPrivate, privateSection, renamePage,
  type PageMeta, type Person, type Tree,
} from "@homelab/notes-access-sync-poc-model";
import { useSyncExternalStore } from "react";
import { useLevel, useLocalReady } from "../sync/context";
import type { LocalPages } from "../sync/pages";
import type { DocEntry } from "../sync/SyncManager";
import { SharePanel } from "./SharePanel";

/** How this person shows up in other people's cursors. */
export interface Identity {
  name: string;
  color: string;
}

interface Props {
  page: PageMeta;
  pages: LocalPages;
  /** This device's tree, for the breadcrumb. */
  tree: Tree;
  identity: Identity;
  me: Person;
}

export function PageView({ page, pages, tree, identity, me }: Props) {
  // The page is in the tree, so its document is open: its title, content and access live there together.
  const entry = pages.entry(page.id)!;
  const ready = useLocalReady(entry);
  const level = useLevel(pages, page.id);
  // Below Can edit the page is read-only here too, not only on the server (ADR 14).
  const editable = canEdit(level);
  const metas = useSyncExternalStore(pages.subscribe, pages.getSnapshot);
  // Built from this device's tree, so it starts below any parent this person can't open.
  const crumbs = breadcrumb(tree, page.id).slice(0, -1);

  return (
    <article className="page" data-testid="page" data-page-id={page.id} data-level={level}>
      <nav className="breadcrumb" data-testid="breadcrumb">
        {crumbs.map((n) => (
          <a key={n.page.id} href={`#/page/${n.page.id}`} data-testid="breadcrumb-item">
            {n.page.title || "Untitled"}
          </a>
        ))}
      </nav>
      <div className="page-head">
        <input
          className="page-title"
          data-testid="page-title"
          placeholder="Untitled"
          value={page.title}
          readOnly={!editable}
          onChange={(e) => renamePage(entry.doc, e.target.value)}
        />
      </div>
      {canShare(level) && me.role !== "guest" && movesToPrivate(tree, page.id, null, privateSection(me.id)) && (
        <div className="page-actions">
          <button
            className="link"
            data-testid="move-to-private"
            onClick={() => {
              // Story 44: moving to Private removes everyone else's access, so ask first.
              const title = page.title || "Untitled";
              if (!confirm(`Move “${title}” to your Private section? This removes everyone else's access to it.`)) return;
              movePage(pages, tree, page.id, null, Number.MAX_SAFE_INTEGER, privateSection(me.id));
            }}
          >
            Move to Private
          </button>
        </div>
      )}
      {canShare(level) && <SharePanel page={page} doc={entry.doc} me={me} pages={metas} />}
      {ready ? (
        // A fresh copy after a refused update (#18) gets a fresh editor.
        <Editor key={`${entry.name}#${entry.generation}`} entry={entry} identity={identity} editable={editable} />
      ) : (
        <p className="muted">Loading…</p>
      )}
    </article>
  );
}

function Editor({ entry, identity, editable }: { entry: DocEntry; identity: Identity; editable: boolean }) {
  const editor = useCreateBlockNote(
    withCollaboration({
      collaboration: {
        fragment: entry.doc.getXmlFragment("content"),
        user: { ...identity },
        // The editor only mounts once the local copy has loaded, so the provider exists.
        provider: entry.provider as unknown as { awareness: NonNullable<NonNullable<DocEntry["provider"]>["awareness"]> },
        showCursorLabels: "always",
      },
    }),
    [entry],
  );
  return (
    <div data-testid="editor">
      <BlockNoteView editor={editor} theme="light" editable={editable} />
    </div>
  );
}
