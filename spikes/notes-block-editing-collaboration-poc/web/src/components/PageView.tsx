import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import type { Block } from "@blocknote/core";
import { withCollaboration } from "@blocknote/core/yjs";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import type * as Y from "yjs";
import type { Identity } from "../identity";
import type { PageMeta } from "../model/tree";
import { useLocalReady, useSyncManager } from "../sync/context";
import type { DocEntry } from "../sync/sync-manager";
import { pageDocName, renamePage, trashPage } from "../sync/workspace";

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
          data-testid="trash-page"
          onClick={() => {
            trashPage(workspace, page.id);
            location.hash = "#/";
          }}
        >
          Delete
        </button>
      </div>
      {ready ? (
        <Editor
          key={entry.name}
          entry={entry}
          identity={identity}
        />
      ) : (
        <p className="muted">Loading…</p>
      )}
    </article>
  );
}

/** True if the document has anything beyond the single empty paragraph a new editor starts with. */
export function hasContent(blocks: Block<any, any, any>[]): boolean {
  return blocks.some(
    (b) =>
      b.type !== "paragraph" ||
      (Array.isArray(b.content) && b.content.length > 0) ||
      b.children.length > 0,
  );
}

export function Editor({
  entry,
  identity,
  onChange,
}: {
  entry: DocEntry;
  identity: Identity;
  onChange?: (blocks: Block<any, any, any>[]) => void;
}) {
  const editor = useCreateBlockNote(
    withCollaboration({
      collaboration: {
        fragment: entry.doc.getXmlFragment("content"),
        user: { ...identity },
        provider: { awareness: entry.provider.awareness ?? undefined },
        showCursorLabels: "always",
      },
    }),
    [entry],
  );
  return (
    <div data-testid="editor">
      <BlockNoteView
        editor={editor}
        theme="light"
        onChange={onChange && (() => onChange(editor.document))}
      />
    </div>
  );
}
