import {
  Button,
  Group,
  Menu,
  Modal,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useState, type FormEvent } from "react";
import { createWorkspace } from "./api.ts";
import type { Notebook, Workspace } from "./sync/notebook.ts";

const nameOf = (workspace: Workspace) => workspace.name ?? "Untitled workspace";

/**
 * The top of the sidebar: the workspace open now, and a menu to switch to another, rename this
 * one or make a new one (spec #130). Workspaces can't be deleted.
 */
export function WorkspaceSwitcher({
  notebook,
  workspaces,
  current,
  online,
  onSwitch,
}: {
  notebook: Notebook;
  workspaces: readonly Workspace[];
  current: Workspace | undefined;
  online: boolean;
  /** Called to open workspace `id`, including one just made. */
  onSwitch: (id: string) => void;
}) {
  const [renaming, rename] = useDisclosure();
  const [creating, create] = useDisclosure();
  if (!current) return null;
  return (
    <>
      <Menu
        position="bottom-start"
        width={248}
      >
        <Menu.Target>
          <UnstyledButton
            w="100%"
            px="xs"
            py={4}
          >
            <Text
              fw={600}
              truncate
            >
              {current.name ?? ""}
            </Text>
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Workspaces</Menu.Label>
          {workspaces.map((workspace) => (
            <Menu.Item
              key={workspace.id}
              onClick={() => onSwitch(workspace.id)}
              rightSection={workspace.id === current.id ? <CheckIcon /> : null}
              aria-current={workspace.id === current.id ? "true" : undefined}
            >
              {nameOf(workspace)}
            </Menu.Item>
          ))}
          <Menu.Divider />
          <Menu.Item onClick={rename.open}>Rename workspace</Menu.Item>
          <Menu.Item
            onClick={create.open}
            disabled={!online}
          >
            New workspace
          </Menu.Item>
          {!online && <OfflineHint />}
        </Menu.Dropdown>
      </Menu>
      <RenameWorkspace
        key={`${current.id}:${String(renaming)}`}
        opened={renaming}
        onClose={rename.close}
        workspace={current}
        onRename={(name) => notebook.renameWorkspace(current.id, name)}
      />
      <NewWorkspace
        key={String(creating)}
        opened={creating}
        onClose={create.close}
        online={online}
        onCreated={async (id) => {
          await notebook.whenListed(id);
          onSwitch(id);
          create.close();
        }}
      />
    </>
  );
}

function OfflineHint() {
  return (
    <Text
      size="xs"
      c="dimmed"
      px="sm"
      pb={6}
    >
      Creating a workspace needs a connection.
    </Text>
  );
}

function RenameWorkspace({
  opened,
  onClose,
  workspace,
  onRename,
}: {
  opened: boolean;
  onClose: () => void;
  workspace: Workspace;
  onRename: (name: string) => void;
}) {
  const [name, setName] = useState(workspace.name ?? "");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    onRename(name.trim());
    onClose();
  };
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Rename workspace"
    >
      <form onSubmit={submit}>
        <Stack>
          <TextInput
            label="Name"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            data-autofocus
          />
          <Group justify="flex-end">
            <Button
              type="submit"
              disabled={!name.trim()}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function NewWorkspace({
  opened,
  onClose,
  online,
  onCreated,
}: {
  opened: boolean;
  onClose: () => void;
  online: boolean;
  onCreated: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !online) return;
    setBusy(true);
    setFailed(false);
    try {
      await onCreated(await createWorkspace(name.trim()));
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="New workspace"
    >
      <form onSubmit={(event) => void submit(event)}>
        <Stack>
          <TextInput
            label="Name"
            placeholder="Side projects"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            data-autofocus
          />
          {!online && (
            <Text
              size="sm"
              c="dimmed"
            >
              Creating a workspace needs a connection.
            </Text>
          )}
          {failed && online && (
            <Text
              size="sm"
              c="red"
            >
              Couldn't create the workspace. Try again.
            </Text>
          )}
          <Group justify="flex-end">
            <Button
              type="submit"
              loading={busy}
              disabled={!name.trim() || !online}
            >
              Create
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden
    >
      <path
        d="M3 8.5l3.5 3.5L13 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
