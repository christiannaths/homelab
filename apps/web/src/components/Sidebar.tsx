import type { PageMeta } from "../sync/workspace";
import { SyncBadge } from "./SyncBadge";

interface Props {
  pages: PageMeta[];
  currentId: string | null;
  onCreate: () => void;
}

export function Sidebar({ pages, currentId, onCreate }: Props) {
  return (
    <nav className="sidebar">
      <div className="sidebar-head">
        <strong>LocalNotion</strong>
        <SyncBadge />
      </div>
      <button className="new-page" onClick={onCreate} data-testid="new-page">
        + New page
      </button>
      <ul className="page-list" data-testid="page-list">
        {pages.map((p) => (
          <li key={p.id}>
            <a href={`#/page/${p.id}`} className={p.id === currentId ? "active" : undefined}>
              {p.title || "Untitled"}
            </a>
          </li>
        ))}
      </ul>
      <a className="diag-link" href="#/diagnostics">
        Diagnostics
      </a>
    </nav>
  );
}
