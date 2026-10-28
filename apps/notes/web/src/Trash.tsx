import {
  ActionIcon,
  Box,
  Group,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import type { TreeNode } from "@homelab/notes-model";
import { useState } from "react";
import { ChevronIcon, RestoreIcon } from "./icons.tsx";

/**
 * The sidebar's Trash: the trashed pages with their subpages, each restorable on its own. Restore
 * only (spec #130): nothing here deletes a page for good.
 */
export function Trash({
  pages,
  onRestore,
}: {
  /** The top of each trashed subtree, with its subpages. */
  pages: readonly TreeNode[];
  onRestore: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Stack
      component="section"
      aria-label="Trash"
      gap={0}
    >
      <UnstyledButton
        px="xs"
        py={4}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Group gap={4}>
          <ChevronIcon open={open} />
          <Text
            size="xs"
            fw={600}
            c="dimmed"
          >
            Trash
          </Text>
        </Group>
      </UnstyledButton>
      {open &&
        (pages.length === 0 ? (
          <Text
            size="sm"
            c="dimmed"
            px="xs"
          >
            The Trash is empty.
          </Text>
        ) : (
          <TrashList
            nodes={pages}
            onRestore={onRestore}
          />
        ))}
    </Stack>
  );
}

function TrashList({
  nodes,
  label,
  onRestore,
}: {
  nodes: readonly TreeNode[];
  label?: string;
  onRestore: (id: string) => void;
}) {
  return (
    <Box
      component="ul"
      aria-label={label}
      m={0}
      p={0}
      style={{ listStyle: "none" }}
    >
      {nodes.map((node) => {
        const title = node.page.title || "Untitled";
        return (
          <li key={node.page.id}>
            <Group
              gap={0}
              wrap="nowrap"
              pl={8 + node.depth * 16}
            >
              <Text
                size="sm"
                truncate
                style={{ flex: 1, minWidth: 0 }}
              >
                {title}
              </Text>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={`Restore ${title}`}
                onClick={() => onRestore(node.page.id)}
              >
                <RestoreIcon />
              </ActionIcon>
            </Group>
            {node.children.length > 0 && (
              <TrashList
                nodes={node.children}
                label={`Subpages of ${title}`}
                onRestore={onRestore}
              />
            )}
          </li>
        );
      })}
    </Box>
  );
}
