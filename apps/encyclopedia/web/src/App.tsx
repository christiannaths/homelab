import { Center, Stack, Text, Title } from "@mantine/core";

// A title page only, so sign-in and sign-out can be tried across two apps on one domain before
// reading is built. It has no sign-in of its own: the homelab's sign-in decides who reaches it.
export function App() {
  return (
    <Center
      mih="100dvh"
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
  );
}
