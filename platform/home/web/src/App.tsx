import {
  Anchor,
  Badge,
  Center,
  Group,
  Image,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { useSyncExternalStore } from "react";
import type { App as HomelabApp, Me } from "@homelab/app-switcher/me";
import type { SignedInState } from "@homelab/signed-in-state";

export function App({ state }: { state: SignedInState<Me> }) {
  const view = useSyncExternalStore(state.subscribe, () => state.view);
  switch (view.screen) {
    case "needs-connection":
      return (
        <Center
          mih="100dvh"
          p="lg"
        >
          <Stack
            maw={420}
            gap="md"
          >
            <Title
              order={1}
              size="h3"
            >
              Home
            </Title>
            <Text>
              Signing in needs a connection. Connect to the internet to sign in.
            </Text>
          </Stack>
        </Center>
      );
    case "signed-in":
      return (
        <Stack
          p="lg"
          gap="lg"
          maw={960}
          mx="auto"
        >
          <Group component="header">
            <Group gap="sm">
              <Title
                order={1}
                size="h3"
              >
                Home
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
          </Group>
          <SimpleGrid
            component="ul"
            aria-label="Your apps"
            cols={{ base: 2, xs: 3, sm: 4, md: 5 }}
            spacing="md"
            p={0}
            m={0}
            style={{ listStyle: "none" }}
          >
            {view.me.apps.map((app) => (
              <li key={app.id}>
                <Tile
                  app={app}
                  // As in the App switcher: an app that doesn't open offline would only show a
                  // "no connection" page.
                  unavailable={!view.online && !app.opensOffline}
                />
              </li>
            ))}
          </SimpleGrid>
        </Stack>
      );
  }
  // Starting: checking who is signed in, or leaving for a sign-in page.
  return null;
}

function Tile({ app, unavailable }: { app: HomelabApp; unavailable: boolean }) {
  return (
    <Anchor
      href={unavailable ? undefined : app.url}
      aria-disabled={unavailable || undefined}
      underline="never"
      c={unavailable ? "dimmed" : "inherit"}
      display="block"
      style={unavailable ? { cursor: "default", opacity: 0.5 } : undefined}
    >
      <Paper
        withBorder
        p="md"
        radius="md"
      >
        <Stack
          align="center"
          gap="xs"
        >
          {app.icon ? (
            <Image
              src={app.icon}
              alt=""
              // With CORS, which the gateway allows for icons, so Home's service worker keeps it.
              crossOrigin="anonymous"
              w={64}
              h={64}
              radius="lg"
            />
          ) : (
            <ThemeIcon
              size={64}
              radius="lg"
              color="gray"
              aria-hidden
            >
              {app.name.slice(0, 1)}
            </ThemeIcon>
          )}
          <Text
            fw={500}
            ta="center"
          >
            {app.name}
          </Text>
        </Stack>
      </Paper>
    </Anchor>
  );
}
