import { Center, Group, Stack, Text, Title } from "@mantine/core";

// A title page only, so sign-in and sign-out can be tried across apps on one domain before reading
// is built. It has no sign-in of its own: the homelab's sign-in decides who reaches it, and the App
// switcher, which the gateway adds to the page, signs out (ADR-ENCY-004).
export function App() {
  return (
    <Stack
      mih="100dvh"
      gap={0}
    >
      <Group
        component="header"
        px="lg"
        py="sm"
      >
        <Text fw={600}>Encyclopedia</Text>
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
