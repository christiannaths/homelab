import {
  setPersonAccess, setWorkspaceAccess, shareEntries, type AccessLevel, type PageMeta, type Person,
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
  /** Every page document this device holds, to show where inherited entries come from. */
  pages: readonly PageMeta[];
}

/**
 * A minimal Share menu, shown only with Full access. It lists every per-person entry the page has,
 * set here or inherited ("from <page>"). Changing an inherited entry's level sets an override on
 * this page (expand or restrict, down to No access), and an override offers Restore inherited
 * access, which removes it. General access works the same way. It edits the page document's
 * `access` map; the server refuses such edits below Full access.
 */
export function SharePanel({ page, doc, me, pages }: Props) {
  const [people, setPeople] = useState<Person[]>([]);
  const [invitee, setInvitee] = useState("");
  const [level, setLevel] = useState<AccessLevel>("view");
  useEffect(() => {
    // The people list needs the server; offline, only the current entries are shown.
    fetchPeople().then(setPeople, () => {});
  }, []);

  const shared = shareEntries(pages, page.id);
  const titleOf = (id: string) => pages.find((p) => p.id === id)?.title || "Untitled";
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "Someone";
  const listed = new Set(shared.people.map((e) => e.personId));
  const invitable = people.filter((p) => p.id !== me.id && !listed.has(p.id));
  const general = shared.workspace;
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
        {shared.people.map((entry) => {
          const here = entry.from === page.id;
          return (
            <li
              key={entry.personId}
              data-testid="share-entry"
              data-person-id={entry.personId}
              data-source={here ? (entry.overrides ? "override" : "invite") : "inherited"}
            >
              <span>
                {nameOf(entry.personId)}{" "}
                {!here && <small className="muted" data-testid="share-entry-from">from {titleOf(entry.from)}</small>}
                {here && entry.overrides && <small className="muted">overrides inherited access</small>}
              </span>
              <select
                data-testid="share-entry-level"
                value={entry.level}
                onChange={(e) => setPersonAccess(doc, entry.personId, e.target.value as AccessLevel)}
              >
                {LEVELS.map((l) => (
                  <option key={l.level} value={l.level}>
                    {l.label}
                  </option>
                ))}
              </select>
              {here && (
                <button className="link" data-testid="share-entry-remove" onClick={() => setPersonAccess(doc, entry.personId, null)}>
                  {entry.overrides ? "Restore inherited access" : "Remove"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {shared.inheritsFromHidden && (
        <p className="muted" data-testid="share-hidden-parent">
          This page also inherits access from a page you can't open, which isn't listed.
        </p>
      )}
      <label className="share-general">
        General access{" "}
        <select
          data-testid="share-general"
          value={general.from === page.id ? general.level : "inherit"}
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
