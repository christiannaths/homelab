import type { Person } from "@homelab/notes-access-sync-poc-model";
import { useEffect, useState } from "react";
import { fetchPeople, requestAddPerson } from "../identity";

/**
 * "Who are you?": the device picks a person from the workspace's list. On a new workspace it
 * asks for the first person instead, who becomes the workspace owner.
 */
export function PersonPicker({ onPick }: { onPick: (person: Person) => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    fetchPeople().then(setPeople, (e: Error) => setError(e.message));
  }, []);

  if (error) return <div className="boot">Can't reach the server to list people: {error}</div>;
  if (!people) return <div className="boot">Loading people…</div>;

  if (people.length === 0) {
    return (
      <form
        className="picker"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            onPick(await requestAddPerson(name, "owner", null));
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <h1>Set up the workspace</h1>
        <p>You are the first person here, so you will be the workspace owner.</p>
        <input data-testid="setup-name" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        <button data-testid="setup-submit" type="submit" disabled={!name.trim()}>
          Create workspace
        </button>
      </form>
    );
  }

  return (
    <div className="picker">
      <h1>Who are you?</h1>
      <ul>
        {people.map((p) => (
          <li key={p.id}>
            <button data-testid="person-option" onClick={() => onPick(p)}>
              {p.name} <span className="muted">{p.role}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
