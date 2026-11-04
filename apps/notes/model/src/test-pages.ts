import { PRIVATE_SECTION, type Page } from "./page.ts";

export const WORKSPACE = "ws-1";
export const ADA = "ada";

/** A live page in Ada's workspace; top-level pages get Ada at Full access, as `newPage` gives them. */
export function page(id: string, fields: Partial<Page> = {}): Page {
  const parentId = fields.parentId ?? null;
  return {
    id,
    workspaceId: WORKSPACE,
    title: id,
    kind: "page",
    parentId,
    section: PRIVATE_SECTION,
    order: "a0",
    createdAt: 1,
    deletedAt: null,
    access: parentId === null ? { people: { [ADA]: "full" } } : { people: {} },
    ...fields,
  };
}
