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
import {
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { buildTree } from "@homelab/notes-model";
import type { SignedInState } from "@homelab/signed-in-state";
import type { Person } from "./api.ts";
import { NoPage, PageView } from "./PageView.tsx";
import { navigate, pageIdFrom, pagePath, usePath } from "./routes.ts";
import { Sidebar } from "./Sidebar.tsx";
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
  const { workspaces, pages, levels, indexSynced } = useSyncExternalStore(
    notebook.subscribe,
    notebook.getSnapshot,
  );
  const [opened, { toggle, close }] = useDisclosure();
  // Choosing between workspaces comes with the workspace switcher; a new person has one.
  const workspace = workspaces[0];
  const tree = useMemo(
    () => (workspace ? buildTree(pages, workspace.id) : undefined),
    [pages, workspace],
  );
  const pageId = pageIdFrom(usePath());
  const page = pageId ? tree?.byId.get(pageId)?.page : undefined;
  const firstPage = tree?.roots[0]?.page.id;

  // Anywhere but a page's address lands on the first page of the Private section (spec #130).
  useEffect(() => {
    if (pageId === null && firstPage)
      navigate(pagePath(firstPage), { replace: true });
  }, [pageId, firstPage]);

  const addPage = () => {
    if (!workspace) return;
    navigate(pagePath(notebook.addPage(workspace.id)));
    close();
  };

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
              tt="none"
            >
              Offline · saved locally
            </Badge>
          )}
        </Group>
      </AppShell.Header>
      <Sidebar
        workspace={workspace}
        privatePages={tree?.roots ?? []}
        currentId={page?.id ?? null}
        onAddPage={addPage}
        onNavigate={close}
      />
      <AppShell.Main>
        {page ? (
          <PageView
            key={page.id}
            notebook={notebook}
            page={page}
            level={levels.get(page.id)}
            me={me}
          />
        ) : (
          pageId !== null && (
            // Until the index has synced, a page this device lacks may still be on its way.
            <NoPage loading={(online && !indexSynced) || levels.has(pageId)} />
          )
        )}
      </AppShell.Main>
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
