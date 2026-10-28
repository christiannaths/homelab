/** The Yjs documents Notes syncs (ADR-NOTE-013, spec #130); ids are random UUIDs. */
export const pageDocName = (id: string): string => `page:${id}`;
/** Server-written, read-only to devices. */
export const indexDocName = (personId: string): string => `index:${personId}`;
export const workspaceDocName = (id: string): string => `workspace:${id}`;

export type DocRef =
  | { kind: "page"; id: string }
  | { kind: "index"; personId: string }
  | { kind: "workspace"; id: string };

export function parseDocName(name: string): DocRef | null {
  const [, kind, id] = /^(page|index|workspace):(.+)$/.exec(name) ?? [];
  if (kind === "page" || kind === "workspace") return { kind, id };
  if (kind === "index") return { kind, personId: id };
  return null;
}
