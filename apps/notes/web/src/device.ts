// What this device remembers between starts. It is small and not shared, so it lives in local
// storage rather than in Yjs documents (ADR-NOTE-005).
import { parsePerson, type Person } from "./api.ts";

const PERSON_KEY = "notes.person";

// Storage can be unavailable (a private window, blocked site data); the app then remembers
// nothing, as on a device that has never signed in.
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // See read().
  }
}

/** The person as of the last successful session check. */
export function rememberedPerson(): Person | undefined {
  const saved = read(PERSON_KEY);
  if (!saved) return undefined;
  try {
    return parsePerson(JSON.parse(saved));
  } catch {
    return undefined;
  }
}

export function rememberPerson(person: Person | undefined): void {
  write(PERSON_KEY, person ? JSON.stringify(person) : null);
}
