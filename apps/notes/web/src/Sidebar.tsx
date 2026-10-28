import {
  ActionIcon,
  AppShell,
  Group,
  ScrollArea,
  Stack,
  Text,
} from "@mantine/core";
import type { TreeNode } from "@homelab/notes-model";
import type { ReactNode } from "react";
import { PlusIcon } from "./icons.tsx";
import { PageTree } from "./PageTree.tsx";
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
  currentAbove,
  onAddPage,
  onNavigate,
}: {
  /** The workspace switcher, at the top. */
  switcher: ReactNode;
  workspace: Workspace | undefined;
  /** The live top-level pages of the Private section, with their subpages. */
  privatePages: readonly TreeNode[];
  currentId: string | null;
  /** The ids of the pages above the current one, from the top down. */
  currentAbove: readonly string[];
  /** Adds a page at the end of the Private section, or of `parentId`'s subpages. */
  onAddPage: (parentId: string | null) => void;
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
              onClick={() => onAddPage(null)}
              disabled={!workspace}
            >
              <PlusIcon />
            </ActionIcon>
          </Group>
          <PageTree
            roots={privatePages}
            currentId={currentId}
            above={currentAbove}
            onAddSubpage={onAddPage}
            onNavigate={onNavigate}
          />
        </Stack>
      </AppShell.Section>
    </AppShell.Navbar>
  );
}
