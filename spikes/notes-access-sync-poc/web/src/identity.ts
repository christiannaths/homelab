import type { Person, Role } from "@homelab/notes-access-sync-poc-model";

// Spike-only identity: the device picks a person from the workspace's list and remembers it.
// The person's id is the connection token, and the server trusts it. Real sign-in is ADR-NOTE-009.

const KEY = "notes-access.person";
const COLORS = ["#e03131", "#2f9e44", "#1971c2", "#f08c00", "#9c36b5", "#0c8599", "#c2255c"];

/** The person this device picked, kept so the app still starts offline. */
export function loadPerson(): Person | null {
  try {
    const saved = localStorage.getItem(KEY);
    return saved ? (JSON.parse(saved) as Person) : null;
  } catch {
    return null;
  }
}

export function savePerson(person: Person | null): void {
  try {
    if (person) localStorage.setItem(KEY, JSON.stringify(person));
    else localStorage.removeItem(KEY);
  } catch {
    // Non-fatal: the device will ask again next time.
  }
}

/** A stable cursor colour per person. */
export function colorFor(person: Person): string {
  let hash = 0;
  for (const ch of person.id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

export async function fetchPeople(): Promise<Person[]> {
  const res = await fetch("/api/people");
  if (!res.ok) throw new Error(`Could not load people (${res.status})`);
  return res.json();
}

/** Removes a person from the workspace, as `actor` (an owner). Their devices delete the workspace's pages. */
export async function requestRemovePerson(personId: string, actor: Person): Promise<void> {
  const res = await fetch(`/api/people/${encodeURIComponent(personId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${actor.id}` },
  });
  if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `Failed (${res.status})`);
}

/** Adds a person as `actor`. With no actor, only works on an empty workspace (it creates the owner). */
export async function requestAddPerson(name: string, role: Role, actor: Person | null): Promise<Person> {
  const res = await fetch("/api/people", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(actor ? { Authorization: `Bearer ${actor.id}` } : {}) },
    body: JSON.stringify({ name, role }),
  });
  if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `Failed (${res.status})`);
  return res.json();
}
