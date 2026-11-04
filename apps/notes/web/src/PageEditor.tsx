import "@blocknote/mantine/style.css";
import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { withCollaboration } from "@blocknote/core/yjs";
import { BlockNoteView, type Theme } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { useComputedColorScheme } from "@mantine/core";
import { pageContent } from "@homelab/notes-model";
import { tokens } from "@homelab/theme/tokens";
import type * as Y from "yjs";
import type { Person } from "./api.ts";
import type { Notebook } from "./sync/notebook.ts";

// Uploads aren't in this slice (spec #130), so blocks that hold a file aren't offered: without
// them in the schema, BlockNote leaves them out of its menus.
const {
  image: _image,
  file: _file,
  video: _video,
  audio: _audio,
  ...textBlocks
} = defaultBlockSpecs;
const schema = BlockNoteSchema.create({ blockSpecs: textBlocks });

/** BlockNote in the homelab look (ADR-NOTE-007), from the same tokens as Mantine's theme. */
function editorTheme(scheme: "light" | "dark"): Theme {
  const surface = {
    text: tokens.text[scheme],
    background: tokens.surface[scheme],
  };
  return {
    colors: {
      editor: surface,
      menu: surface,
      tooltip: {
        text: tokens.surface[scheme],
        background: tokens.text[scheme],
      },
      hovered: { text: tokens.text[scheme], background: tokens.hover[scheme] },
      selected: {
        text: tokens.surface[scheme],
        background: tokens.text[scheme],
      },
      disabled: {
        text: tokens.dimmed[scheme],
        background: tokens.hover[scheme],
      },
      shadow: tokens.shadow.medium,
      border: tokens.border[scheme],
      sideMenu: tokens.dimmed[scheme],
    },
    // Mantine's "md" radius, which the rest of the app uses.
    borderRadius: 8,
    fontFamily: tokens.font,
  };
}

/** A collaborator's cursor colour, from their id, so it is the same on every device. */
function cursorColour(id: string): string {
  let hash = 0;
  for (const char of id)
    hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  return tokens.avatar[hash % tokens.avatar.length] ?? tokens.avatar[0];
}

/**
 * Page `pageId`'s body, bound to `doc`'s `content` (ADR-NOTE-007). Mount it with a `key` per
 * document: a fresh copy after a refused update needs a fresh editor.
 */
export function PageEditor({
  notebook,
  pageId,
  doc,
  me,
  editable,
}: {
  notebook: Notebook;
  pageId: string;
  doc: Y.Doc;
  me: Person;
  editable: boolean;
}) {
  const scheme = useComputedColorScheme("light");
  const editor = useCreateBlockNote(
    withCollaboration({
      schema,
      collaboration: {
        fragment: pageContent(doc),
        user: { name: me.name ?? "Someone", color: cursorColour(me.id) },
        provider: { awareness: notebook.awareness(pageId) },
      },
    }),
    [doc],
  );
  return (
    <BlockNoteView
      editor={editor}
      editable={editable}
      theme={editorTheme(scheme)}
    />
  );
}
