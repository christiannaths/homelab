/** Workspace roles, as in Notion. Enterprise-only roles are out of scope. */
export type Role = "owner" | "member" | "guest";
const ROLES: readonly Role[] = ["owner", "member", "guest"];
export const isRole = (value: unknown): value is Role =>
  ROLES.some((role) => role === value);

/** A person in the workspace. Identity is faked: the id doubles as the connection token. */
export interface Person {
  id: string;
  name: string;
  role: Role;
}

/** Reads a person sent as JSON (the people API), throwing on anything else. */
export function parsePerson(value: unknown): Person {
  if (typeof value !== "object" || value === null)
    throw new Error("a person must be an object");
  const id = "id" in value ? value.id : undefined;
  const name = "name" in value ? value.name : undefined;
  const role = "role" in value ? value.role : undefined;
  if (typeof id !== "string" || typeof name !== "string" || !isRole(role))
    throw new Error(`not a person: ${JSON.stringify(value)}`);
  return { id, name, role };
}

export type AddPersonResult =
  { ok: true; person: Person } | { ok: false; reason: string };

/**
 * Decides whether `actor` may add a person, and with which role.
 * The first person on a new workspace becomes its owner, whatever role was asked for.
 * After that only an owner may add people.
 */
export function addPerson(
  people: readonly Person[],
  actor: Person | null,
  input: { id: string; name: string; role: Role },
): AddPersonResult {
  const name = input.name.trim();
  if (!name) return { ok: false, reason: "A person needs a name." };
  if (people.length === 0)
    return { ok: true, person: { id: input.id, name, role: "owner" } };
  if (actor?.role !== "owner")
    return { ok: false, reason: "Only a workspace owner can add people." };
  return { ok: true, person: { id: input.id, name, role: input.role } };
}

/**
 * Decides whether `actor` may remove the person `personId` from the workspace (story 45). Only an
 * owner may, and the workspace always keeps at least one owner. Removing someone takes away every
 * page they could open: their devices delete the workspace's pages at their next sync. Their own
 * Private pages stay on the server, readable by nobody (transferring them is Enterprise-only in
 * Notion, and out of scope).
 */
export function removePerson(
  people: readonly Person[],
  actor: Person | null,
  personId: string,
): AddPersonResult {
  if (actor?.role !== "owner")
    return { ok: false, reason: "Only a workspace owner can remove people." };
  const person = people.find((p) => p.id === personId);
  if (!person) return { ok: false, reason: "No such person." };
  if (
    person.role === "owner" &&
    people.filter((p) => p.role === "owner").length === 1
  ) {
    return { ok: false, reason: "The workspace needs at least one owner." };
  }
  return { ok: true, person };
}
