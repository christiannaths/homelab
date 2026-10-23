import {
  Badge,
  Center,
  Group,
  Stack,
  Text,
  Title,
  useComputedColorScheme,
} from "@mantine/core";
import type { SwitcherTheme } from "@homelab/app-switcher/react";
import { useSyncExternalStore, type ReactNode } from "react";
import type { Notes } from "./notes.ts";

export function App({ notes }: { notes: Notes }) {
  const view = useSyncExternalStore(notes.subscribe, () => notes.view);
  const scheme: SwitcherTheme = useComputedColorScheme("light");
  switch (view.screen) {
    case "needs-connection":
      return (
        <Message title="Notes">
          <Text>
            Signing in needs a connection. Connect to the internet to sign in.
          </Text>
        </Message>
      );
    case "home":
      return (
        <Stack
          p="lg"
          gap="md"
        >
          <Group
            justify="space-between"
            component="header"
          >
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
            <homelab-switcher theme={scheme} />
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
