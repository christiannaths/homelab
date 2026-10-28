import {
  AppShell,
  Badge,
  Burger,
  Center,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useSyncExternalStore, type ReactNode } from "react";
import type { SignedInState } from "@homelab/signed-in-state";
import type { Person } from "./api.ts";
import { notebookFor } from "./sync/notebook.ts";

export function App({ state }: { state: SignedInState<Person> }) {
  const view = useSyncExternalStore(state.subscribe, () => state.view);
  switch (view.screen) {
    case "needs-connection":
      return (
        <Message title="Notes">
          <Text>
            Signing in needs a connection. Connect to the internet to sign in.
          </Text>
        </Message>
      );
    case "signed-in":
      return (
        <Notes
          me={view.me}
          online={view.online}
        />
      );
  }
  // Starting: checking the session, or leaving for a sign-in page.
  return null;
}

function Notes({ me, online }: { me: Person; online: boolean }) {
  const notebook = notebookFor(me.id);
  const { workspaces } = useSyncExternalStore(
    notebook.subscribe,
    notebook.getSnapshot,
  );
  const [opened, { toggle }] = useDisclosure();
  // Choosing between workspaces comes with the workspace switcher; a new person has one.
  const workspace = workspaces[0];
  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 280, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group
          h="100%"
          px="md"
          gap="sm"
        >
          <Burger
            opened={opened}
            onClick={toggle}
            hiddenFrom="sm"
            size="sm"
            aria-label="Sidebar"
          />
          <Title
            order={1}
            size="h3"
          >
            Notes
          </Title>
          {!online && (
            <Badge
              color="gray"
              variant="light"
            >
              Offline
            </Badge>
          )}
        </Group>
      </AppShell.Header>
      <AppShell.Navbar
        p="md"
        aria-label="Sidebar"
      >
        {workspace && (
          <Text
            fw={600}
            truncate
          >
            {workspace.name}
          </Text>
        )}
      </AppShell.Navbar>
      <AppShell.Main />
    </AppShell>
  );
}

function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Center
      mih="100dvh"
      p="lg"
    >
      <Stack
        maw={420}
        gap="md"
        align="flex-start"
      >
        <Title
          order={1}
          size="h3"
        >
          {title}
        </Title>
        {children}
      </Stack>
    </Center>
  );
}
