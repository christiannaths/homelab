import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { withCollaboration } from "@blocknote/core/yjs";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { canEdit, canShare, renamePage, type PageMeta, type Person } from "@homelab/notes-access-sync-poc-model";
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
  identity: Identity;
  me: Person;
}

export function PageView({ page, pages, identity, me }: Props) {
  // The page is in the tree, so its document is open: its title, content and access live there together.
  const entry = pages.entry(page.id)!;
  const ready = useLocalReady(entry);
  const level = useLevel(pages, page.id);
  // Below Can edit the page is read-only here too, not only on the server (ADR 14).
  const editable = canEdit(level);

  return (
    <article className="page" data-testid="page" data-page-id={page.id} data-level={level}>
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
      {canShare(level) && <SharePanel page={page} doc={entry.doc} me={me} />}
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
        provider: entry.provider as unknown as { awareness: NonNullable<DocEntry["provider"]["awareness"]> },
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
