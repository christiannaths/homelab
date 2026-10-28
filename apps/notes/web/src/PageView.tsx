import { Center, Loader, Stack, Text, Textarea } from "@mantine/core";
import { canEdit, type AccessLevel, type Page } from "@homelab/notes-model";
import { useState } from "react";
import type { Person } from "./api.ts";
import { PageEditor } from "./PageEditor.tsx";
import type { Notebook } from "./sync/notebook.ts";

/** An open page: its title and body. */
export function PageView({
  notebook,
  page,
  level,
  me,
}: {
  notebook: Notebook;
  page: Page;
  /** The person's level from their index; a page the index doesn't list yet is one made here. */
  level: AccessLevel | undefined;
  me: Person;
}) {
  // Below Can edit the page is read-only here too, not only on the server (ADR-NOTE-012).
  const editable = canEdit(level ?? "full");
  const doc = notebook.loadedPage(page.id);
  return (
    <Stack
      component="article"
      maw={760}
      mx="auto"
      gap="md"
      py="md"
    >
      <Title
        page={page}
        editable={editable}
        onChange={(title) => notebook.updatePage(page.id, { title })}
      />
      {doc ? (
        <PageEditor
          key={doc.guid}
          notebook={notebook}
          pageId={page.id}
          doc={doc}
          me={me}
          editable={editable}
        />
      ) : (
        <Loader size="sm" />
      )}
    </Stack>
  );
}

function Title({
  page,
  editable,
  onChange,
}: {
  page: Page;
  editable: boolean;
  onChange: (title: string) => void;
}) {
  // Held here as well as in the document, since the notebook publishes changes at most every
  // 100 ms and typing mustn't wait for them; another device's rename still replaces it.
  const [value, setValue] = useState(page.title);
  const [published, setPublished] = useState(page.title);
  if (page.title !== published) {
    setPublished(page.title);
    setValue(page.title);
  }
  return (
    <Textarea
      aria-label="Title"
      placeholder="Untitled"
      variant="unstyled"
      autosize
      minRows={1}
      readOnly={!editable}
      value={value}
      onChange={(event) => {
        // A title is one line; pasted line breaks become spaces.
        const title = event.currentTarget.value.replace(/\s*\n\s*/g, " ");
        setValue(title);
        onChange(title);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.preventDefault();
      }}
      styles={{
        input: {
          fontSize: "var(--mantine-h1-font-size)",
          fontWeight: 700,
          lineHeight: 1.2,
          // Lines the title up with the body's text, which BlockNote indents for its side menu.
          paddingInline: 54,
        },
      }}
    />
  );
}

/** Where a page would be when this device doesn't have it. */
export function NoPage({ loading }: { loading: boolean }) {
  return (
    <Center py="xl">
      {loading ? (
        <Loader size="sm" />
      ) : (
        <Text c="dimmed">This page isn't available.</Text>
      )}
    </Center>
  );
}
