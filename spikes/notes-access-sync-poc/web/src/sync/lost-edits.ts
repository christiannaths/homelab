import {
  copyPageContent,
  createPage,
  privateSection,
  readMeta,
  type PageDocs,
  type Tree,
} from "@homelab/notes-access-sync-poc-model";
import * as Y from "yjs";
import { readJson, writeJson } from "./sync-manager";

/** Edits to a page this person lost access to before the server got them (#21, story 40). */
export interface LostEdit {
  pageId: string;
  title: string;
  /** The device's last copy of the page (a full Yjs update), edits included. */
  update: Uint8Array;
}

interface Stored {
  pageId: string;
  title: string;
  update: string;
}

function parseStoredList(value: unknown): Stored[] {
  if (!Array.isArray(value)) throw new Error("expected a list of lost edits");
  return value.map((item: unknown) => {
    if (typeof item !== "object" || item === null)
      throw new Error("a lost edit must be an object");
    const pageId = "pageId" in item ? item.pageId : undefined;
    const title = "title" in item ? item.title : undefined;
    const update = "update" in item ? item.update : undefined;
    if (
      typeof pageId !== "string" ||
      typeof title !== "string" ||
      typeof update !== "string"
    )
      throw new Error("a lost edit has missing fields");
    return { pageId, title, update };
  });
}

/**
 * The lost edits this device is offering back, until the person keeps or discards each one. The
 * page itself is already deleted; only this copy is left, kept in localStorage so the offer
 * survives a reload. The copy is the whole page as the device had it, not just the edits: Yjs
 * can't take the server's version back out of it, and the person could read all of it before.
 */
export class LostEdits {
  private items: LostEdit[];
  private readonly listeners = new Set<() => void>();

  constructor(private readonly key: string) {
    this.items = (readJson(key, parseStoredList) ?? []).map((s) => ({
      ...s,
      update: fromBase64(s.update),
    }));
  }

  add(pageId: string, update: Uint8Array): void {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, update);
    const title = readMeta(pageId, doc)?.title ?? "";
    doc.destroy();
    this.items = [
      ...this.items.filter((i) => i.pageId !== pageId),
      { pageId, title, update },
    ];
    this.changed();
  }

  /**
   * Keeps the edits as a new page at the top of `personId`'s Private section, with the lost page's
   * title and content (none of its access). Returns the new page's id.
   */
  keep(item: LostEdit, docs: PageDocs, tree: Tree, personId: string): string {
    const lost = new Y.Doc();
    Y.applyUpdate(lost, item.update);
    const id = createPage(docs, tree, {
      section: privateSection(personId),
      title: item.title,
    });
    copyPageContent(lost, docs.get(id)!);
    lost.destroy();
    this.discard(item);
    return id;
  }

  discard(item: LostEdit): void {
    this.items = this.items.filter((i) => i !== item);
    this.changed();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): LostEdit[] => this.items;

  private changed(): void {
    writeJson(
      this.key,
      this.items.map((i) => ({
        pageId: i.pageId,
        title: i.title,
        update: toBase64(i.update),
      })),
    );
    for (const l of this.listeners) l();
  }
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
