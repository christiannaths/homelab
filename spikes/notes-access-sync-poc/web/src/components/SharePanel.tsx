import {
  setPersonAccess, setWorkspaceAccess, type AccessLevel, type PageMeta, type Person,
} from "@homelab/notes-access-sync-poc-model";
import { useEffect, useState } from "react";
import type * as Y from "yjs";
import { fetchPeople } from "../identity";

/** The levels the Share menu offers on a page (Can edit content is for databases only). */
const LEVELS: { level: AccessLevel; label: string }[] = [
  { level: "full", label: "Full access" },
  { level: "edit", label: "Can edit" },
  { level: "comment", label: "Can comment" },
  { level: "view", label: "Can view" },
  { level: "none", label: "No access" },
];
const label = (level: AccessLevel) => LEVELS.find((l) => l.level === level)?.label ?? level;

interface Props {
  page: PageMeta;
  doc: Y.Doc;
  me: Person;
}

/**
 * A minimal Share menu, shown only with Full access: invite a person at a level, change or
 * remove the entries set on this page, and set general access for everyone in the workspace.
 * It edits the page document's `access` map; the server refuses such edits below Full access.
 * Inherited entries aren't listed (#16 adds them, with Restricted and Restore inherited access).
 */
export function SharePanel({ page, doc, me }: Props) {
  const [people, setPeople] = useState<Person[]>([]);
  const [invitee, setInvitee] = useState("");
  const [level, setLevel] = useState<AccessLevel>("view");
  useEffect(() => {
    // The people list needs the server; offline, only the current entries are shown.
    fetchPeople().then(setPeople, () => {});
  }, []);

  const entries = Object.entries(page.access?.people ?? {});
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "Someone";
  const invitable = people.filter((p) => p.id !== me.id && !page.access?.people?.[p.id]);
  const topLevel = page.parentId === null;

  return (
    <section className="share" data-testid="share-panel">
      <h3>Share</h3>
      <form
        className="share-invite"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invitee) return;
          setPersonAccess(doc, invitee, level);
          setInvitee("");
        }}
      >
        <select data-testid="share-person" value={invitee} onChange={(e) => setInvitee(e.target.value)}>
          <option value="">Invite someone…</option>
          {invitable.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select data-testid="share-level" value={level} onChange={(e) => setLevel(e.target.value as AccessLevel)}>
          {LEVELS.filter((l) => l.level !== "none").map((l) => (
            <option key={l.level} value={l.level}>
              {l.label}
            </option>
          ))}
        </select>
        <button data-testid="share-invite" type="submit" disabled={!invitee}>
          Invite
        </button>
      </form>
      <ul className="share-entries">
        {entries.map(([personId, entryLevel]) => (
          <li key={personId} data-testid="share-entry" data-person-id={personId}>
            <span>{nameOf(personId)}</span>
            <select
              data-testid="share-entry-level"
              value={entryLevel}
              onChange={(e) => setPersonAccess(doc, personId, e.target.value as AccessLevel)}
            >
              {LEVELS.map((l) => (
                <option key={l.level} value={l.level}>
                  {l.label}
                </option>
              ))}
            </select>
            <button className="link" data-testid="share-entry-remove" onClick={() => setPersonAccess(doc, personId, null)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <label className="share-general">
        General access{" "}
        <select
          data-testid="share-general"
          value={page.access?.workspace ?? "inherit"}
          onChange={(e) => setWorkspaceAccess(doc, e.target.value === "inherit" ? null : (e.target.value as AccessLevel))}
        >
          <option value="inherit">{topLevel ? "Only people invited" : "Same as the parent page"}</option>
          {!topLevel && <option value="none">Only people invited</option>}
          {LEVELS.filter((l) => l.level !== "none").map((l) => (
            <option key={l.level} value={l.level}>
              Everyone in the workspace: {label(l.level)}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
