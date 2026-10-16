import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { withCollaboration } from "@blocknote/core/yjs";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import type * as Y from "yjs";
import type { Identity } from "../identity";
import { useLocalReady, useSyncManager } from "../sync/context";
import type { DocEntry } from "../sync/SyncManager";
import { pageDocName, renamePage, trashPage, type PageMeta } from "../sync/workspace";

interface Props {
  page: PageMeta;
  workspace: Y.Doc;
  identity: Identity;
}

export function PageView({ page, workspace, identity }: Props) {
  const manager = useSyncManager();
  const entry = manager.open(pageDocName(page.id));
  const ready = useLocalReady(entry);

  return (
    <article className="page">
      <div className="page-head">
        <input
          className="page-title"
          data-testid="page-title"
          placeholder="Untitled"
          value={page.title}
          onChange={(e) => renamePage(workspace, page.id, e.target.value)}
        />
        <button
          className="trash"
          title="Move to trash"
          onClick={() => {
            trashPage(workspace, page.id);
            location.hash = "#/";
          }}
        >
          Delete
        </button>
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
