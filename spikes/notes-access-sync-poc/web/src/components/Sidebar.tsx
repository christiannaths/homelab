import {
  createPage,
  flattenVisible,
  privateSection,
  readTeamspaceIndex,
  sidebarSections,
  type Person,
  type Tree,
  type TreeNode,
} from "@homelab/notes-access-sync-poc-model";
import { useExpanded } from "../use-expanded";
import type { LocalPages } from "../sync/pages";
import { SyncBadge } from "./SyncBadge";

interface Props {
  pages: LocalPages;
  tree: Tree;
  currentId: string | null;
  me: Person;
  onSwitchPerson: () => void;
}

/** The sidebar, built only from the page documents this device received. */
export function Sidebar({ pages, tree, currentId, me, onSwitchPerson }: Props) {
  const { isExpanded, setExpanded } = useExpanded();
  // Teamspaces have no UI here yet, but a page from a teamspace this person can't see (always, for
  // a guest) was shared with them on its own, so it goes in Shared (#19).
  const sections = sidebarSections(
    tree,
    me.id,
    new Set(readTeamspaceIndex(pages.index.doc).keys()),
  );
  // Guests have no Private section and create no top-level pages.
  const canCreate = me.role !== "guest";

  const newPage = (parentId: string | null) => {
    const id = createPage(pages, tree, {
      parentId,
      section: privateSection(me.id),
    });
    if (parentId) setExpanded(parentId, true);
    window.location.assign(`#/page/${id}`);
  };

  const section = (
    key: "shared" | "private",
    label: string,
    roots: TreeNode[],
  ) => (
    <section
      className="side-section"
      data-testid="sidebar-section"
      data-section={key}
    >
      <h3 className="side-section-title">{label}</h3>
      <ul
        className="page-tree"
        data-testid="page-tree"
      >
        {flattenVisible({ roots }, isExpanded).map((node) => (
          <TreeRow
            key={node.page.id}
            node={node}
            active={node.page.id === currentId}
            expanded={isExpanded(node.page.id)}
            onToggle={() =>
              setExpanded(node.page.id, !isExpanded(node.page.id))
            }
            onAddChild={() => newPage(node.page.id)}
          />
        ))}
      </ul>
    </section>
  );

  return (
    <nav className="sidebar">
      <div className="sidebar-head">
        <strong>Notes spike</strong>
        <SyncBadge />
      </div>
      <div className="me">
        <span data-testid="current-person">{me.name}</span>{" "}
        <span
          className="muted"
          data-testid="current-role"
        >
          {me.role}
        </span>
        <button
          className="link"
          onClick={onSwitchPerson}
          data-testid="switch-person"
        >
          Switch
        </button>
      </div>
      {canCreate && (
        <button
          className="side-action"
          onClick={() => newPage(null)}
          data-testid="new-page"
        >
          + New page
        </button>
      )}
      <div className="side-sections">
        {sections.shared.length > 0 &&
          section("shared", "Shared", sections.shared)}
        {canCreate && section("private", "Private", sections.private)}
      </div>
      {me.role === "owner" && (
        <a
          className="side-link"
          href="#/people"
          data-testid="people-link"
        >
          People
        </a>
      )}
    </nav>
  );
}

interface RowProps {
  node: TreeNode;
  active: boolean;
  expanded: boolean;
  onToggle: () => void;
  onAddChild: () => void;
}

function TreeRow({ node, active, expanded, onToggle, onAddChild }: RowProps) {
  const id = node.page.id;
  return (
    <li
      className={["tree-row", active && "active"].filter(Boolean).join(" ")}
      style={{ paddingLeft: 4 + node.depth * 16 }}
      data-testid="tree-row"
      data-page-id={id}
      data-depth={node.depth}
    >
      <button
        className="toggle"
        onClick={onToggle}
        aria-label={expanded ? "Collapse" : "Expand"}
        data-testid="tree-toggle"
        style={{ visibility: node.children.length ? "visible" : "hidden" }}
      >
        {expanded ? "▾" : "▸"}
      </button>
      <a
        href={`#/page/${id}`}
        className="tree-link"
      >
        <span className="icon">📄</span>
        {node.page.title || "Untitled"}
      </a>
      <button
        className="add-child"
        onClick={onAddChild}
        aria-label="Add subpage"
        data-testid="add-subpage"
      >
        +
      </button>
    </li>
  );
}
