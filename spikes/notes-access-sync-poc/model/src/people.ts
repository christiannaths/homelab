/** Workspace roles, as in Notion. Enterprise-only roles are out of scope. */
export type Role = "owner" | "member" | "guest";

/** A person in the workspace. Identity is faked: the id doubles as the connection token. */
export interface Person {
  id: string;
  name: string;
  role: Role;
}

export type AddPersonResult = { ok: true; person: Person } | { ok: false; reason: string };

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
  if (people.length === 0) return { ok: true, person: { id: input.id, name, role: "owner" } };
  if (actor?.role !== "owner") return { ok: false, reason: "Only a workspace owner can add people." };
  return { ok: true, person: { id: input.id, name, role: input.role } };
}
