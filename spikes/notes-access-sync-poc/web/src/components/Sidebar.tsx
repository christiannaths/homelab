import { createPage, flattenVisible, type Person, type Tree, type TreeNode } from "@homelab/notes-access-sync-poc-model";
import type * as Y from "yjs";
import { useExpanded } from "../useExpanded";
import { SyncBadge } from "./SyncBadge";

interface Props {
  workspace: Y.Doc;
  tree: Tree;
  currentId: string | null;
  me: Person;
  onSwitchPerson: () => void;
}

export function Sidebar({ workspace, tree, currentId, me, onSwitchPerson }: Props) {
  const { isExpanded, setExpanded } = useExpanded();
  const rows = flattenVisible(tree, isExpanded);

  const newPage = (parentId: string | null) => {
    const id = createPage(workspace, tree, { parentId });
    if (parentId) setExpanded(parentId, true);
    location.hash = `#/page/${id}`;
  };

  return (
    <nav className="sidebar">
      <div className="sidebar-head">
        <strong>Notes spike</strong>
        <SyncBadge />
      </div>
      <div className="me">
        <span data-testid="current-person">{me.name}</span>{" "}
        <span className="muted" data-testid="current-role">{me.role}</span>
        <button className="link" onClick={onSwitchPerson} data-testid="switch-person">
          Switch
        </button>
      </div>
      <button className="side-action" onClick={() => newPage(null)} data-testid="new-page">
        + New page
      </button>
      <ul className="page-tree" data-testid="page-tree">
        {rows.map((node) => (
          <TreeRow
            key={node.page.id}
            node={node}
            active={node.page.id === currentId}
            expanded={isExpanded(node.page.id)}
            onToggle={() => setExpanded(node.page.id, !isExpanded(node.page.id))}
            onAddChild={() => newPage(node.page.id)}
          />
        ))}
      </ul>
      {me.role === "owner" && (
        <a className="side-link" href="#/people" data-testid="people-link">
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
      <a href={`#/page/${id}`} className="tree-link">
        <span className="icon">📄</span>
        {node.page.title || "Untitled"}
      </a>
      <button className="add-child" onClick={onAddChild} aria-label="Add subpage" data-testid="add-subpage">
        +
      </button>
    </li>
  );
}
