import { ActionIcon, Box, Group, NavLink } from "@mantine/core";
import type { AccessLevel, TreeNode } from "@homelab/notes-model";
import { canChange } from "./levels.ts";
import { useState, type MouseEvent } from "react";
import { ChevronIcon, PlusIcon, TrashIcon } from "./icons.tsx";
import { followLink, pagePath } from "./routes.ts";

/**
 * A sidebar section's pages with their subpages, each expandable. Pages start collapsed; going
 * to a page expands the pages above it, so the current page is always in view until the person
 * collapses one again.
 */
export function PageTree({
  roots,
  currentId,
  above,
  levels,
  onAddSubpage,
  onTrash,
  onNavigate,
}: {
  roots: readonly TreeNode[];
  currentId: string | null;
  /** The ids of the pages above the current one, from the top down. */
  above: readonly string[];
  /** The person's level on each page, from their index. */
  levels: ReadonlyMap<string, AccessLevel>;
  onAddSubpage: (parentId: string) => void;
  /** Moves a page to the Trash; its subpages go with it. */
  onTrash: (id: string) => void;
  /** Called after going to a page, so a phone can close the sidebar. */
  onNavigate: () => void;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  // Keyed on the pages above as well, since they may arrive after the page itself.
  const reveal = currentId === null ? null : [...above, currentId].join("/");
  const [revealed, setRevealed] = useState<string | null>(null);
  if (reveal !== revealed) {
    setRevealed(reveal);
    if (above.some((id) => !expanded.has(id)))
      setExpanded(new Set([...expanded, ...above]));
  }

  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (!next.delete(id)) next.add(id);
    setExpanded(next);
  };

  return (
    <PageList
      nodes={roots}
      label="Pages"
      state={{
        currentId,
        expanded,
        onToggle: toggle,
        levels,
        onAddSubpage,
        onTrash,
        onNavigate,
      }}
    />
  );
}

interface ItemState {
  currentId: string | null;
  expanded: ReadonlySet<string>;
  onToggle: (id: string) => void;
  levels: ReadonlyMap<string, AccessLevel>;
  onAddSubpage: (parentId: string) => void;
  onTrash: (id: string) => void;
  onNavigate: () => void;
}

function PageList({
  nodes,
  label,
  state,
}: {
  nodes: readonly TreeNode[];
  label?: string;
  state: ItemState;
}) {
  return (
    <Box
      component="ul"
      aria-label={label}
      m={0}
      p={0}
      style={{ listStyle: "none" }}
    >
      {nodes.map((node) => (
        <PageItem
          key={node.page.id}
          node={node}
          state={state}
        />
      ))}
    </Box>
  );
}

function PageItem({ node, state }: { node: TreeNode; state: ItemState }) {
  const { id } = node.page;
  const title = node.page.title || "Untitled";
  const href = pagePath(id);
  const hasSubpages = node.children.length > 0;
  const open = hasSubpages && state.expanded.has(id);
  const editable = canChange(state.levels, id);
  return (
    <li>
      <Group
        gap={0}
        wrap="nowrap"
        pl={node.depth * 16}
      >
        {hasSubpages ? (
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={`${open ? "Collapse" : "Expand"} ${title}`}
            aria-expanded={open}
            onClick={() => state.onToggle(id)}
          >
            <ChevronIcon open={open} />
          </ActionIcon>
        ) : (
          <Box
            w={22}
            style={{ flexShrink: 0 }}
          />
        )}
        <NavLink
          href={href}
          label={title}
          active={id === state.currentId}
          style={{ flex: 1, minWidth: 0 }}
          onClick={(event: MouseEvent) => {
            if (followLink(event.nativeEvent, href)) state.onNavigate();
          }}
        />
        {editable && (
          <>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label={`Add a subpage to ${title}`}
              onClick={() => state.onAddSubpage(id)}
            >
              <PlusIcon />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label={`Move ${title} to Trash`}
              onClick={() => state.onTrash(id)}
            >
              <TrashIcon />
            </ActionIcon>
          </>
        )}
      </Group>
      {open && (
        <PageList
          nodes={node.children}
          label={`Subpages of ${title}`}
          state={state}
        />
      )}
    </li>
  );
}
