import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { withCollaboration } from "@blocknote/core/yjs";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { renamePage, type PageMeta } from "@homelab/notes-access-sync-poc-model";
import { useLocalReady } from "../sync/context";
import type { LocalPages } from "../sync/pages";
import type { DocEntry } from "../sync/SyncManager";

/** How this person shows up in other people's cursors. */
export interface Identity {
  name: string;
  color: string;
}

interface Props {
  page: PageMeta;
  pages: LocalPages;
  identity: Identity;
}

export function PageView({ page, pages, identity }: Props) {
  // The page is in the tree, so its document is open: its title and content live there together.
  const entry = pages.entry(page.id)!;
  const ready = useLocalReady(entry);

  return (
    <article className="page">
      <div className="page-head">
        <input
          className="page-title"
          data-testid="page-title"
          placeholder="Untitled"
          value={page.title}
          onChange={(e) => renamePage(entry.doc, e.target.value)}
        />
      </div>
      {ready ? <Editor key={entry.name} entry={entry} identity={identity} /> : <p className="muted">Loading…</p>}
    </article>
  );
}

function Editor({ entry, identity }: { entry: DocEntry; identity: Identity }) {
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
      <BlockNoteView editor={editor} theme="light" />
    </div>
  );
}
