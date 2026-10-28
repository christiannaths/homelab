// The documents the server reads and writes, and what each holds (ADR-NOTE-013).
import * as Y from "yjs";
import type { WorkspaceRole } from "./workspaces.ts";

export type DocumentRef =
  | { kind: "index"; personId: string }
  | { kind: "workspace"; workspaceId: string };

export const indexName = (personId: string) => `index:${personId}`;
export const workspaceDocumentName = (workspaceId: string) =>
  `workspace:${workspaceId}`;

export function parseDocumentName(name: string): DocumentRef | undefined {
  const separator = name.indexOf(":");
  const kind = name.slice(0, separator);
  const id = name.slice(separator + 1);
  if (separator < 0 || !id) return undefined;
  if (kind === "index") return { kind, personId: id };
  if (kind === "workspace") return { kind, workspaceId: id };
  return undefined;
}

/** What one person's index lists: no names or titles, only ids. */
export interface PersonIndex {
  workspaces: ReadonlyMap<string, WorkspaceRole>;
}

export const sameIndex = (a: PersonIndex, b: PersonIndex): boolean =>
  a.workspaces.size === b.workspaces.size &&
  [...a.workspaces].every(([id, role]) => b.workspaces.get(id) === role);

/** Makes an index document list exactly `index`, touching only the entries that change. */
export function writeIndex(doc: Y.Doc, index: PersonIndex): void {
  const workspaces = doc.getMap<string>("workspaces");
  doc.transact(() => {
    for (const id of workspaces.keys())
      if (!index.workspaces.has(id)) workspaces.delete(id);
    for (const [id, role] of index.workspaces)
      if (workspaces.get(id) !== role) workspaces.set(id, role);
  });
}

export function writeWorkspaceName(doc: Y.Doc, name: string): void {
  doc.getMap<string>("meta").set("name", name);
}
