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
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ancestors, buildTree } from "@homelab/notes-model";
import type { SignedInState } from "@homelab/signed-in-state";
import type { Person } from "./api.ts";
import { readLastPlace, rememberPlace } from "./last-place.ts";
import { NoPage, PageView } from "./PageView.tsx";
import { navigate, pageIdFrom, pagePath, usePath } from "./routes.ts";
import { Sidebar } from "./Sidebar.tsx";
import { notebookFor } from "./sync/notebook.ts";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher.tsx";

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
  const [chosenId, setChosenId] = useState(
    () => readLastPlace(me.id).workspaceId,
  );
  const pageId = pageIdFrom(usePath());
  // A page's address opens its own workspace; anywhere else, the one last chosen on this device.
  const pageWorkspaceId = pages.find((p) => p.id === pageId)?.workspaceId;
  const workspace =
    workspaces.find((w) => w.id === (pageWorkspaceId ?? chosenId)) ??
    workspaces[0];
  const tree = useMemo(
    () => (workspace ? buildTree(pages, workspace.id) : undefined),
    [pages, workspace],
  );
  const page = pageId ? tree?.byId.get(pageId)?.page : undefined;
  const above = tree && page ? ancestors(tree, page.id).map((n) => n.page) : [];
  // Anywhere but a page's address lands on the page last open in the workspace, or else the
  // first page of its Private section (spec #130).
  const landing = useMemo(() => {
    if (!workspace || !tree) return undefined;
    const last = readLastPlace(me.id).pages[workspace.id];
    return last && tree.byId.has(last) ? last : tree.roots[0]?.page.id;
  }, [me.id, workspace, tree]);

  useEffect(() => {
    if (pageId === null && landing)
      navigate(pagePath(landing), { replace: true });
  }, [pageId, landing]);

  const workspaceId = workspace?.id;
  // A page opened by its address makes its workspace the chosen one, so leaving the page stays
  // there.
  if (workspaceId && workspaceId !== chosenId) setChosenId(workspaceId);
  const openPageId = page?.id ?? null;
  useEffect(() => {
    if (workspaceId) rememberPlace(me.id, workspaceId, openPageId);
  }, [me.id, workspaceId, openPageId]);

  const switchTo = (id: string) => {
    setChosenId(id);
    rememberPlace(me.id, id, null);
    navigate("/");
    close();
  };

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
        switcher={
          <WorkspaceSwitcher
            notebook={notebook}
            workspaces={workspaces}
            current={workspace}
            online={online}
            onSwitch={switchTo}
          />
        }
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
