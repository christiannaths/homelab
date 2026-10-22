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
  useComputedColorScheme,
} from "@mantine/core";
import type { SwitcherTheme } from "@homelab/app-switcher/react";
import { useSyncExternalStore } from "react";
import type { App as HomelabApp } from "./api.ts";
import type { Home } from "./home.ts";

export function App({ home }: { home: Home }) {
  const view = useSyncExternalStore(home.subscribe, () => home.view);
  const scheme: SwitcherTheme = useComputedColorScheme("light");
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
    case "home":
      return (
        <Stack
          p="lg"
          gap="lg"
          maw={960}
          mx="auto"
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
            <homelab-switcher theme={scheme} />
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
                <Tile app={app} />
              </li>
            ))}
          </SimpleGrid>
        </Stack>
      );
  }
  // Starting: checking who is signed in, or leaving for a sign-in page.
  return null;
}

function Tile({ app }: { app: HomelabApp }) {
  return (
    <Anchor
      href={app.url}
      underline="never"
      c="inherit"
      display="block"
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
