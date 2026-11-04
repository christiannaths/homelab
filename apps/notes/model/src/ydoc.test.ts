import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import type { Catalog } from "./access.ts";
import { indexDocName, pageDocName, workspaceDocName } from "./documents.ts";
import { restorePatch, trashPatch } from "./edits.ts";
import {
  applyPagePatch,
  observePage,
  pageContent,
  previewUpdate,
  readIndex,
  readPage,
  readWorkspaceName,
  setWorkspaceName,
  writeIndex,
  writeNewPage,
} from "./ydoc.ts";
import { reviewUpdate } from "./review.ts";
import { ADA, page, WORKSPACE } from "./test-pages.ts";

/** An update made on a device that holds `doc`, without changing `doc`. */
function updateFrom(doc: Y.Doc, edit: (copy: Y.Doc) => void): Uint8Array {
  const copy = new Y.Doc();
  Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
  const vector = Y.encodeStateVector(copy);
  edit(copy);
  return Y.encodeStateAsUpdate(copy, vector);
}

function pageDoc(p = page("p")): Y.Doc {
  const doc = new Y.Doc();
  writeNewPage(doc, p);
  return doc;
}

describe("a page document", () => {
  it("reads back the page it was created with", () => {
    const p = page("p", {
      title: "Groceries",
      order: "a5",
      access: { people: { [ADA]: "full", ben: "view" }, workspace: "comment" },
    });
    expect(readPage("p", pageDoc(p))).toEqual(p);
  });

  it("reads as nothing until its meta arrives", () => {
    expect(readPage("p", new Y.Doc())).toBeNull();
  });

  it("goes to the Trash and comes back", () => {
    const doc = pageDoc();
    applyPagePatch(doc, trashPatch(7));
    expect(readPage("p", doc)?.deletedAt).toBe(7);
    applyPagePatch(doc, restorePatch([readPage("p", doc)!], "p")!);
    expect(readPage("p", doc)?.deletedAt).toBeNull();
  });

  it("tells its observers when its page changes, not when its body does", () => {
    const doc = pageDoc();
    let calls = 0;
    const stop = observePage(doc, () => calls++);
    pageContent(doc).insert(0, [new Y.XmlText("typing")]);
    expect(calls).toBe(0);
    applyPagePatch(doc, { title: "Renamed" });
    applyPagePatch(doc, { access: { people: { ben: "view" } } });
    expect(calls).toBe(2);
    stop();
    applyPagePatch(doc, { title: "Again" });
    expect(calls).toBe(2);
  });

  it("ignores access entries that aren't levels", () => {
    const doc = pageDoc();
    doc.getMap("access").set("person:ben", "owner");
    doc.getMap("access").set("teamspace", "edit");
    expect(readPage("p", doc)?.access).toEqual({ people: { [ADA]: "full" } });
  });
});

describe("previewing an update on a scratch copy", () => {
  it("says what the update changes and leaves the document alone", () => {
    const doc = pageDoc();
    const update = updateFrom(doc, (d) => {
      pageContent(d).insert(0, [new Y.XmlText("hello")]);
      applyPagePatch(d, { title: "New" });
    });
    const change = previewUpdate(pageDocName("p"), doc, update);
    expect([...change.touched].toSorted()).toEqual(["content", "meta"]);
    expect(change.after?.title).toBe("New");
    expect(readPage("p", doc)?.title).toBe("p");
    expect(pageContent(doc).length).toBe(0);
  });

  it("counts an edit deep inside the body as touching the content", () => {
    const doc = pageDoc();
    const paragraph = new Y.XmlElement("paragraph");
    paragraph.insert(0, [new Y.XmlText("hi")]);
    pageContent(doc).insert(0, [paragraph]);
    const update = updateFrom(doc, (d) => {
      const [block] = pageContent(d).toArray();
      const [text] = block instanceof Y.XmlElement ? block.toArray() : [];
      if (text instanceof Y.XmlText) text.insert(2, "!");
    });
    expect([...previewUpdate(pageDocName("p"), doc, update).touched]).toEqual([
      "content",
    ]);
  });

  it("finds nothing new in an update the document already has", () => {
    const doc = pageDoc();
    const update = Y.encodeStateAsUpdate(doc);
    expect(previewUpdate(pageDocName("p"), doc, update).touched.size).toBe(0);
  });

  it("feeds the review: a viewer's edit is refused, Full access's share accepted", () => {
    const doc = pageDoc(
      page("p", { access: { people: { [ADA]: "full", ben: "view" } } }),
    );
    const catalog: Catalog = {
      pages: new Map([["p", readPage("p", doc)!]]),
      members: new Map([[WORKSPACE, new Set([ADA, "ben"])]]),
    };
    const edit = updateFrom(doc, (d) =>
      pageContent(d).insert(0, [new Y.XmlText("x")]),
    );
    const share = updateFrom(doc, (d) =>
      applyPagePatch(d, { access: { people: { ben: "edit" } } }),
    );
    const review = (personId: string, update: Uint8Array) =>
      reviewUpdate(
        catalog,
        personId,
        pageDocName("p"),
        previewUpdate(pageDocName("p"), doc, update),
      );
    expect(review("ben", edit)).toBe("read-only");
    expect(review("ben", share)).toBe("read-only");
    expect(review(ADA, share)).toBeNull();
  });
});

describe("an index document", () => {
  it("lists exactly the pages and workspaces written to it", () => {
    const doc = new Y.Doc();
    writeIndex(doc, {
      pages: new Map([
        ["a", "full"],
        ["b", "view"],
      ]),
      workspaces: new Set(["w1", "w2"]),
    });
    writeIndex(doc, {
      pages: new Map([["a", "edit"]]),
      workspaces: new Set(["w2"]),
    });
    expect(readIndex(doc)).toEqual({
      pages: new Map([["a", "edit"]]),
      workspaces: new Set(["w2"]),
    });
  });

  it("reads a level it doesn't know as Can view, the safe side", () => {
    const doc = new Y.Doc();
    doc.getMap("pages").set("a", "owner");
    expect(readIndex(doc).pages.get("a")).toBe("view");
  });

  it("has names that tell documents apart", () => {
    expect(
      new Set([indexDocName("x"), pageDocName("x"), workspaceDocName("x")])
        .size,
    ).toBe(3);
  });
});

describe("a workspace document", () => {
  it("holds the workspace's name", () => {
    const doc = new Y.Doc();
    expect(readWorkspaceName(doc)).toBeNull();
    setWorkspaceName(doc, "Ada's workspace");
    expect(readWorkspaceName(doc)).toBe("Ada's workspace");
  });
});
