import * as Y from "yjs";

/** One doc per workspace holds the page index; each page's content is its own doc. */
export const WORKSPACE_DOC = "workspace:default";
export const pageDocName = (id: string) => `page:${id}`;

export interface PageMeta {
  id: string;
  title: string;
  parentId: string | null;
  createdAt: number;
  deletedAt?: number;
}

// Each page is a nested Y.Map so concurrent edits to different fields (e.g. a
// rename and a move) merge instead of one overwriting the other.
export const pagesMap = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>("pages");

export function readPages(doc: Y.Doc): PageMeta[] {
  const pages: PageMeta[] = [];
  pagesMap(doc).forEach((m, id) => {
    if (m.get("deletedAt")) return;
    pages.push({
      id,
      title: (m.get("title") as string) ?? "",
      parentId: (m.get("parentId") as string | null) ?? null,
      createdAt: (m.get("createdAt") as number) ?? 0,
    });
  });
  return pages.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

export function createPage(doc: Y.Doc, title = ""): string {
  const id = crypto.randomUUID();
  const m = new Y.Map<unknown>();
  m.set("title", title);
  m.set("parentId", null);
  m.set("createdAt", Date.now());
  pagesMap(doc).set(id, m);
  return id;
}

export function renamePage(doc: Y.Doc, id: string, title: string): void {
  pagesMap(doc).get(id)?.set("title", title);
}

export function trashPage(doc: Y.Doc, id: string): void {
  pagesMap(doc).get(id)?.set("deletedAt", Date.now());
}
