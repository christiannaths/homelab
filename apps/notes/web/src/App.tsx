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
import { ancestors, buildTree } from "@homelab/notes-model";
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
  const above = tree && page ? ancestors(tree, page.id).map((n) => n.page) : [];
  const firstPage = tree?.roots[0]?.page.id;

  // Anywhere but a page's address lands on the first page of the Private section (spec #130).
  useEffect(() => {
    if (pageId === null && firstPage)
      navigate(pagePath(firstPage), { replace: true });
  }, [pageId, firstPage]);

  const addPage = (parentId: string | null) => {
    if (!workspace) return;
    navigate(pagePath(notebook.addPage(workspace.id, parentId)));
    close();
  };

  // Trashing the open page, or a page above it, goes to the trashed page's parent, else to the
  // first page left in the Private section.
  const trashPage = (id: string) => {
    if (!tree) return;
    notebook.trashPage(id);
    if (page?.id !== id && !above.some((p) => p.id === id)) return;
    const next =
      tree.byId.get(id)?.parentId ??
      tree.roots.find((n) => n.page.id !== id)?.page.id;
    navigate(next ? pagePath(next) : "/", { replace: true });
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
        currentAbove={above.map((p) => p.id)}
        onAddPage={addPage}
        trashedPages={tree?.trash ?? []}
        onTrash={trashPage}
        onRestore={(id) => notebook.restorePage(id)}
        onNavigate={close}
      />
      <AppShell.Main>
        {page ? (
          <PageView
            key={page.id}
            notebook={notebook}
            page={page}
            above={above}
            level={levels.get(page.id)}
            me={me}
          />
        ) : (
          pageId !== null && (
            // Until the index has synced, a page this device lacks may still be on its way.
            <NoPage
              loading={(online && !indexSynced) || levels.has(pageId)}
              // Here but not in the tree's live pages: in the Trash.
              trashed={pages.some(
                (p) => p.id === pageId && p.workspaceId === workspace?.id,
              )}
            />
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
