import {
  Center,
  Group,
  Stack,
  Text,
  Title,
  useComputedColorScheme,
} from "@mantine/core";
import type { SwitcherTheme } from "@homelab/app-switcher/react";

// A title page only, so sign-in and sign-out can be tried across apps on one domain before reading
// is built. It has no sign-in of its own: the homelab's sign-in decides who reaches it, and the App
// switcher in its header signs out (ADR-ENCY-004).
export function App() {
  const scheme: SwitcherTheme = useComputedColorScheme("light");
  return (
    <Stack
      mih="100dvh"
      gap={0}
    >
      <Group
        component="header"
        justify="space-between"
        px="lg"
        py="sm"
      >
        <Text fw={600}>Encyclopedia</Text>
        <homelab-switcher theme={scheme} />
      </Group>
      <Center
        flex={1}
        p="lg"
      >
        <Stack
          maw={420}
          gap="md"
        >
          <Title order={1}>Encyclopedia</Title>
          <Text c="dimmed">
            Wikipedia, kept on your homelab. Reading and search are on the way.
          </Text>
        </Stack>
      </Center>
    </Stack>
  );
}
