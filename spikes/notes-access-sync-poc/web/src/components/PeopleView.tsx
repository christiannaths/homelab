import type { Person, Role } from "@homelab/notes-access-sync-poc-model";
import { useEffect, useState } from "react";
import { fetchPeople, requestAddPerson } from "../identity";

/** The workspace's people. An owner can add members and guests. */
export function PeopleView({ me }: { me: Person }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [error, setError] = useState<string | null>(null);

  const reload = () => fetchPeople().then(setPeople, (e: Error) => setError(e.message));
  useEffect(() => {
    reload();
  }, []);

  return (
    <article className="page">
      <h1>People</h1>
      <ul className="people">
        {people.map((p) => (
          <li key={p.id} data-testid="person-row">
            {p.name} <span className="muted">{p.role}</span>
          </li>
        ))}
      </ul>
      {me.role === "owner" && (
        <form
          className="add-person"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await requestAddPerson(name, role, me);
              setName("");
              setError(null);
              await reload();
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          <input data-testid="add-person-name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <select data-testid="add-person-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="member">member</option>
            <option value="guest">guest</option>
            <option value="owner">owner</option>
          </select>
          <button data-testid="add-person-submit" type="submit" disabled={!name.trim()}>
            Add
          </button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </article>
  );
}
