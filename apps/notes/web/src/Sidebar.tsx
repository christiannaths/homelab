import {
  ActionIcon,
  AppShell,
  Group,
  NavLink,
  ScrollArea,
  Stack,
  Text,
} from "@mantine/core";
import type { TreeNode } from "@homelab/notes-model";
import type { MouseEvent, ReactNode } from "react";
import { navigate, pagePath } from "./routes.ts";
import type { Workspace } from "./sync/notebook.ts";

/**
 * The sidebar, in Notion's order (spec #130): the workspace switcher, then the Private section.
 * The Trash takes its place here as it arrives.
 */
export function Sidebar({
  switcher,
  workspace,
  privatePages,
  currentId,
  onAddPage,
  onNavigate,
}: {
  /** The workspace switcher, at the top. */
  switcher: ReactNode;
  workspace: Workspace | undefined;
  /** The live top-level pages of the Private section, with their subpages. */
  privatePages: readonly TreeNode[];
  currentId: string | null;
  onAddPage: () => void;
  /** Called after going to a page, so a phone can close the sidebar. */
  onNavigate: () => void;
}) {
  return (
    <AppShell.Navbar
      p="xs"
      aria-label="Sidebar"
    >
      <AppShell.Section
        component="section"
        aria-label="Workspace"
      >
        {switcher}
      </AppShell.Section>
      <AppShell.Section
        grow
        component={ScrollArea}
      >
        <Stack
          component="section"
          aria-label="Private"
          gap={0}
        >
          <Group
            justify="space-between"
            px="xs"
            py={4}
          >
            <Text
              size="xs"
              fw={600}
              c="dimmed"
            >
              Private
            </Text>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="Add a page"
              onClick={onAddPage}
              disabled={!workspace}
            >
              <PlusIcon />
            </ActionIcon>
          </Group>
          {privatePages.map((node) => (
            <PageLink
              key={node.page.id}
              node={node}
              currentId={currentId}
              onNavigate={onNavigate}
            />
          ))}
        </Stack>
      </AppShell.Section>
    </AppShell.Navbar>
  );
}

function PageLink({
  node,
  currentId,
  onNavigate,
}: {
  node: TreeNode;
  currentId: string | null;
  onNavigate: () => void;
}) {
  const href = pagePath(node.page.id);
  return (
    <NavLink
      href={href}
      label={node.page.title || "Untitled"}
      active={node.page.id === currentId}
      onClick={(event: MouseEvent) => {
        // A plain click stays in the app; one meant for a new tab or window is the browser's.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        event.preventDefault();
        navigate(href);
        onNavigate();
      }}
    />
  );
}

function PlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden
    >
      <path
        d="M8 3v10M3 8h10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
