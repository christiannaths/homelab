import * as Y from "yjs";
import { isAccessLevel, type AccessLevel } from "./levels.ts";
import type { Person } from "./people.ts";

/**
 * Teamspaces (#17), as in Notion:
 * - `open`: every workspace member can see it, open its pages at the non-member level
 *   (`workspaceLevel`), and join it without asking.
 * - `closed`: every workspace member can see its name, but only people added by a member see its pages.
 * - `private`: only its members see its name and pages. Workspace owners also see its name (to
 *   manage it, as in Notion's Settings → Teamspaces), but not its pages unless they are members.
 */
export type TeamspaceKind = "open" | "closed" | "private";

export type TeamspaceRole = "owner" | "member";

export interface Teamspace {
  id: string;
  name: string;
  kind: TeamspaceKind;
  /** New workspace members join every default teamspace. Only a workspace owner sets it. */
  isDefault: boolean;
  /** The level every member starts from on the teamspace's top-level pages. */
  memberLevel: AccessLevel;
  /** Open teamspaces only: the level everyone else in the workspace (not guests) starts from. Never "none". */
  workspaceLevel: AccessLevel;
  /** Members by person id. Leaving deletes the entry. */
  members: Readonly<Record<string, TeamspaceRole>>;
}

/**
 * A teamspace document (`teamspace:<id>`) holds its `settings` map (name, kind, isDefault,
 * memberLevel, workspaceLevel, createdAt) and its `members` map (person id → role), one key per
 * field and per member, so a rename, a default change and concurrent joins all merge (ADR-NOTE-006
 * rule 4). It reaches exactly the people who may see the teamspace's name (`teamspaceAccess`).
 */
export const settingsMap = (doc: Y.Doc) => doc.getMap<unknown>("settings");
export const membersMap = (doc: Y.Doc) => doc.getMap<unknown>("members");

const KINDS: readonly TeamspaceKind[] = ["open", "closed", "private"];

/** Writes a new teamspace, owned by `owner`, in one transaction (ADR-NOTE-006 rule 2). */
export function createTeamspace(
  doc: Y.Doc,
  opts: { name: string; kind: TeamspaceKind; owner: string; memberLevel?: AccessLevel; workspaceLevel?: AccessLevel; isDefault?: boolean },
): void {
  doc.transact(() => {
    const s = settingsMap(doc);
    s.set("name", opts.name);
    s.set("kind", opts.kind);
    s.set("isDefault", opts.isDefault ?? false);
    s.set("memberLevel", opts.memberLevel ?? "full");
    s.set("workspaceLevel", opts.workspaceLevel ?? "view");
    s.set("createdAt", Date.now());
    membersMap(doc).set(opts.owner, "owner");
  });
}

/** Adds, changes or (with null) removes one member. Joining and leaving are this. */
export function setTeamspaceMember(doc: Y.Doc, personId: string, role: TeamspaceRole | null): void {
  if (role === null) membersMap(doc).delete(personId);
  else membersMap(doc).set(personId, role);
}

/** Changes some of a teamspace's settings, one key each. */
export function setTeamspaceSettings(
  doc: Y.Doc,
  changes: Partial<Pick<Teamspace, "name" | "kind" | "isDefault" | "memberLevel" | "workspaceLevel">>,
): void {
  doc.transact(() => {
    for (const [key, value] of Object.entries(changes)) settingsMap(doc).set(key, value);
  });
}

/** The teamspace, or null until its settings have arrived. Bad values fall back to the safe side. */
export function readTeamspace(id: string, doc: Y.Doc): Teamspace | null {
  const s = settingsMap(doc);
  if (!s.has("createdAt")) return null;
  const kind = s.get("kind") as TeamspaceKind;
  const memberLevel = s.get("memberLevel");
  const workspaceLevel = s.get("workspaceLevel");
  const members: Record<string, TeamspaceRole> = {};
  for (const [personId, role] of membersMap(doc)) {
    if (role === "owner" || role === "member") members[personId] = role;
  }
  return {
    id,
    name: typeof s.get("name") === "string" ? (s.get("name") as string) : "",
    kind: KINDS.includes(kind) ? kind : "private",
    isDefault: s.get("isDefault") === true,
    memberLevel: isAccessLevel(memberLevel) ? memberLevel : "view",
    // Open teamspaces have no "None" for non-members.
    workspaceLevel: isAccessLevel(workspaceLevel) && workspaceLevel !== "none" ? workspaceLevel : "view",
    members,
  };
}

/**
 * The teamspaces a person's page index (`index:<personId>`) lists, beside its pages: teamspace id
 * → their level on its document. Devices follow it to open teamspace documents, so a private
 * teamspace's id (and so its name) only reaches people who may see it. Server-written only.
 */
export const teamspaceIndexMap = (doc: Y.Doc) => doc.getMap<unknown>("teamspaces");

export function readTeamspaceIndex(doc: Y.Doc): Map<string, AccessLevel> {
  const levels = new Map<string, AccessLevel>();
  for (const [id, value] of teamspaceIndexMap(doc)) levels.set(id, isAccessLevel(value) ? value : "view");
  return levels;
}

/** Makes an index list exactly `levels` as its teamspaces, touching only the entries that change. Server only. */
export function writeTeamspaceIndex(doc: Y.Doc, levels: ReadonlyMap<string, AccessLevel>): void {
  const map = teamspaceIndexMap(doc);
  doc.transact(() => {
    for (const id of [...map.keys()]) if (!levels.has(id)) map.delete(id);
    for (const [id, level] of levels) if (map.get(id) !== level) map.set(id, level);
  });
}

/** The teamspace `doc` would hold if `update` were applied, read from a scratch copy (`doc` is left alone). */
export function teamspaceAfterUpdate(id: string, doc: Y.Doc, update: Uint8Array): Teamspace | null {
  const scratch = new Y.Doc();
  Y.applyUpdate(scratch, Y.encodeStateAsUpdate(doc));
  Y.applyUpdate(scratch, update);
  const after = readTeamspace(id, scratch);
  scratch.destroy();
  return after;
}

const REFUSED = "teamspace-change-refused";

/**
 * Why `actor` may not turn the teamspace `before` into `after` (null `before`: creating it), or
 * null if they may. The server checks every change to a teamspace document with it, against its
 * own copy, so a refused change is never applied.
 * - A teamspace left with no owner: "last-owner" (the last owner can't leave or step down).
 * - Making a teamspace default (or not): workspace owners only, whatever its kind.
 * - Its name, kind, default levels, members' roles, and removing other people: teamspace owners only.
 * - Joining: workspace members may join an open teamspace. Members may add other people as
 *   members to any teamspace. Anyone may leave. Guests are never in a teamspace.
 * - Creating: the creator must be one of its owners.
 */
export function refuseTeamspaceChange(
  people: readonly Person[],
  before: Teamspace | null,
  after: Teamspace,
  actor: Person,
): string | null {
  if (!Object.values(after.members).includes("owner")) return "last-owner";
  if (actor.role === "guest" || addsGuest(people, before, after)) return REFUSED;
  if (after.isDefault !== (before?.isDefault ?? false) && actor.role !== "owner") return REFUSED;
  if (!before) return after.members[actor.id] === "owner" ? null : REFUSED;
  if (before.members[actor.id] === "owner") return null;

  const settingsChanged =
    before.name !== after.name ||
    before.kind !== after.kind ||
    before.memberLevel !== after.memberLevel ||
    before.workspaceLevel !== after.workspaceLevel;
  if (settingsChanged) return REFUSED;
  const member = actor.id in before.members;
  for (const id of new Set([...Object.keys(before.members), ...Object.keys(after.members)])) {
    const was = before.members[id];
    const is = after.members[id];
    if (was === is) continue;
    const leaving = id === actor.id && is === undefined;
    const added = was === undefined && is === "member";
    const joining = added && id === actor.id && before.kind === "open";
    const adding = added && id !== actor.id && member;
    if (!leaving && !joining && !adding) return REFUSED;
  }
  return null;
}

/** True if `after` adds a guest: guests only get the pages shared with them, never a teamspace. */
function addsGuest(people: readonly Person[], before: Teamspace | null, after: Teamspace): boolean {
  return Object.keys(after.members).some(
    (id) => !(before && id in before.members) && people.find((p) => p.id === id)?.role === "guest",
  );
}
