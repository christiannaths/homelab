import type { Person } from "./people.ts";

/**
 * The access rules: pure functions from the workspace's people, teamspaces, page tree and grants
 * to each person's effective level. The server asks them which documents a connection may open
 * and write; clients may ask them what to offer.
 *
 * Placeholder: everyone in the workspace has full access to every document. Later tickets add
 * teamspaces, the page tree and grants to `Workspace` and replace the rule.
 */

/** Notion's page access levels, most permissive first. */
export type AccessLevel = "full" | "edit" | "edit-content" | "comment" | "view" | "none";

/** Everything the rules read. Grows as the spike adds teamspaces, the page tree and grants. */
export interface Workspace {
  people: readonly Person[];
}

/** The level `personId` has on the Yjs document named `documentName`. */
export function documentAccess(workspace: Workspace, personId: string, documentName: string): AccessLevel {
  void documentName;
  return workspace.people.some((p) => p.id === personId) ? "full" : "none";
}
