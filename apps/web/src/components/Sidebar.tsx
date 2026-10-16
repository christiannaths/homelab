import {
  DndContext, PointerSensor, pointerWithin, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragMoveEvent,
} from "@dnd-kit/core";
import { useState } from "react";
import type * as Y from "yjs";
import { flattenVisible, isInSubtree, type Tree, type TreeNode } from "../model/tree";
import { useSyncManager } from "../sync/context";
import { createDatabase, createPage, movePage } from "../sync/workspace";
import { useExpanded } from "../useExpanded";
import { SyncBadge } from "./SyncBadge";

interface Props {
  workspace: Y.Doc;
  tree: Tree;
  currentId: string | null;
}

type DropPosition = "before" | "after" | "inside";
interface DropTarget {
  id: string;
  position: DropPosition;
}

export function Sidebar({ workspace, tree, currentId }: Props) {
  const manager = useSyncManager();
  const { isExpanded, setExpanded } = useExpanded();
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const rows = flattenVisible(tree, isExpanded);

  // A small drag distance keeps clicks working; on touch, a long press starts a drag
  // so scrolling the sidebar still works.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const newPage = (parentId: string | null, kind: "page" | "database" = "page") => {
    const id =
      kind === "database"
        ? createDatabase(workspace, tree, (name) => manager.open(name).doc, { parentId })
        : createPage(workspace, tree, { parentId });
    if (parentId) setExpanded(parentId, true);
    location.hash = `#/page/${id}`;
  };

  const targetFor = (e: DragMoveEvent | DragEndEvent): DropTarget | null => {
    const { active, over } = e;
    if (!over || over.id === active.id) return null;
    const target = tree.byId.get(String(over.id));
    if (!target || isInSubtree(tree, target.page.id, String(active.id))) return null;
    const start = e.activatorEvent as PointerEvent | TouchEvent;
    const startY = "touches" in start ? start.touches[0].clientY : start.clientY;
    const y = startY + e.delta.y;
    const { top, height } = over.rect;
    const rel = (y - top) / height;
    const canNest = target.page.kind !== "database";
    const position: DropPosition =
      canNest && rel > 0.25 && rel < 0.75 ? "inside" : rel < 0.5 ? "before" : "after";
    return { id: target.page.id, position };
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDrop(null);
    const t = targetFor(e);
    if (!t) return;
    const id = String(e.active.id);
    const target = tree.byId.get(t.id)!;
    if (t.position === "inside") {
      movePage(workspace, tree, id, t.id, Number.MAX_SAFE_INTEGER);
      setExpanded(t.id, true);
      return;
    }
    const siblings = (target.parentId === null ? tree.roots : tree.byId.get(target.parentId)!.children)
      .filter((n) => n.page.id !== id);
    const index = siblings.findIndex((n) => n.page.id === t.id) + (t.position === "after" ? 1 : 0);
    movePage(workspace, tree, id, target.parentId, index);
  };

  return (
    <nav className="sidebar">
      <div className="sidebar-head">
        <strong>LocalNotion</strong>
        <SyncBadge />
      </div>
      <button className="side-action" onClick={() => newPage(null)} data-testid="new-page">
        + New page
      </button>
      <button className="side-action" onClick={() => newPage(null, "database")} data-testid="new-database">
        + New database
      </button>
      <DndContext
        sensors={sensors}
        // Target whichever row is under the pointer, not the one the dragged box overlaps most.
        collisionDetection={pointerWithin}
        onDragMove={(e) => setDrop(targetFor(e))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDrop(null)}
      >
        <ul className="page-tree" data-testid="page-tree">
          {rows.map((node) => (
            <TreeRow
              key={node.page.id}
              node={node}
              active={node.page.id === currentId}
              expanded={isExpanded(node.page.id)}
              drop={drop?.id === node.page.id ? drop.position : null}
              onToggle={() => setExpanded(node.page.id, !isExpanded(node.page.id))}
              onAddChild={() => newPage(node.page.id)}
            />
          ))}
        </ul>
      </DndContext>
      <a className="side-link" href="#/trash" data-testid="trash-link">
        Trash{tree.trash.length ? ` (${tree.trash.length})` : ""}
      </a>
      <a className="side-link" href="#/diagnostics">
        Diagnostics
      </a>
    </nav>
  );
}

interface RowProps {
  node: TreeNode;
  active: boolean;
  expanded: boolean;
  drop: DropPosition | null;
  onToggle: () => void;
  onAddChild: () => void;
}

function TreeRow({ node, active, expanded, drop, onToggle, onAddChild }: RowProps) {
  const id = node.page.id;
  const drag = useDraggable({ id });
  const dropZone = useDroppable({ id });
  const isDb = node.page.kind === "database";
  return (
    <li
      ref={dropZone.setNodeRef}
      className={["tree-row", active && "active", drag.isDragging && "dragging", drop && `drop-${drop}`]
        .filter(Boolean)
        .join(" ")}
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
      <a ref={drag.setNodeRef} {...drag.listeners} {...drag.attributes} href={`#/page/${id}`} className="tree-link">
        <span className="icon">{isDb ? "▦" : "📄"}</span>
        {node.page.title || "Untitled"}
      </a>
      {!isDb && (
        <button className="add-child" onClick={onAddChild} aria-label="Add subpage" data-testid="add-subpage">
          +
        </button>
      )}
    </li>
  );
}
