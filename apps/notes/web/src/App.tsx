import {
  Badge,
  Button,
  Center,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useSyncExternalStore, type ReactNode } from "react";
import type { Notes } from "./notes.ts";

export function App({ notes }: { notes: Notes }) {
  const view = useSyncExternalStore(notes.subscribe, () => notes.view);
  const signOut = () => void notes.signOut();
  switch (view.screen) {
    case "needs-connection":
      return (
        <Message title="Notes">
          <Text>
            Signing in needs a connection. Connect to the internet to sign in.
          </Text>
        </Message>
      );
    case "no-access":
      return (
        <Message title="Notes">
          <Text>You don't have access to Notes. Ask your homelab admin.</Text>
          <Button onClick={signOut}>Use a different account</Button>
        </Message>
      );
    case "signed-out-here":
      return (
        <Message title="Notes">
          <Text>
            Signed out here. Other apps finish signing out next time Notes is
            online.
          </Text>
        </Message>
      );
    case "home":
      return (
        <Stack
          p="lg"
          gap="md"
        >
          <Group justify="space-between">
            <Group gap="sm">
              <Title
                order={1}
                size="h3"
              >
                Notes
              </Title>
              {!view.online && (
                <Badge
                  color="gray"
                  variant="light"
                >
                  Offline
                </Badge>
              )}
            </Group>
            <Button
              variant="default"
              onClick={signOut}
            >
              Sign out
            </Button>
          </Group>
          <Text>Signed in as {view.person.name ?? "your homelab account"}</Text>
        </Stack>
      );
  }
  // Starting: checking the session, or leaving for a sign-in page.
  return null;
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
