// A large workspace for the scale test (#22), written straight into a server's data directory
// while the server is stopped, so seeding takes seconds and isn't part of what is measured. The
// server builds its catalog and every person's page index from it when it starts, as after any
// restart.
//
//   const server = new TestServer();
//   const seeded = seedWorkspace(server.dataDir);   // the default layout: about 2,000 pages
//   await server.start();
//   seeded.people.olive / .max / .gus;  seeded.pageCount
import {
  addProperty, createTeamspace, DEFAULT_VIEW, freshKeys, metaMap, pageDocName, privateSection, schemaDocName,
  setCell, setPersonAccess, setTeamspaceMember, teamspaceDocName, teamspaceSection, viewsMap,
  type AccessLevel, type PageKind, type Person,
} from "@homelab/notes-access-sync-poc-model";
import * as Y from "yjs";
import { Store } from "../src/store.ts";

/**
 * How many pages go where. Ordinary pages are grouped ten to a top-level page (one parent, nine
 * subpages), each with a heading and 30 paragraphs, the same body as the old spike's scale test.
 */
export interface SeedLayout {
  /** In Olive's Private section (Olive is the workspace owner). */
  olivePrivate: number;
  /** In Max's Private section (Max is a member). */
  maxPrivate: number;
  /** Subpages of Olive's "Shared with Max" page, which she shares with Max at Can edit. */
  sharedWithMax: number;
  /** Subpages of Olive's "Trip" page, which she shares with Gus (a guest) at Can edit. */
  tripForGus: number;
  /** In Engineering, an open teamspace Olive owns and Max has joined. */
  engineering: number;
  /** In Leadership, a private teamspace with Olive as its only member. */
  leadership: number;
  /** Rows of the Tasks database in Engineering (one document per row, #20). */
  tasksRows: number;
  /** Rows of the Reading list database in Olive's Private section. */
  readingRows: number;
  /** Tasks rows Olive also shares on their own with Gus, at Can view. */
  rowsForGus: number;
}

/**
 * The default: 2,272 page documents. Olive can open 1,972 of them (about the 2,001 documents of
 * the ADR-NOTE-010 gate), Max 1,251 and Gus 30.
 */
export const DEFAULT_LAYOUT: SeedLayout = {
  olivePrivate: 700,
  maxPrivate: 300,
  sharedWithMax: 49,
  tripForGus: 19,
  engineering: 600,
  leadership: 200,
  tasksRows: 300,
  readingRows: 100,
  rowsForGus: 10,
};

export interface SeededWorkspace {
  people: { olive: Person; max: Person; gus: Person };
  /** Every page document written, databases and rows included. */
  pageCount: number;
  /** An Engineering page that Olive and Max can both edit (to check that updates still reach their devices). */
  engineeringPageId: string;
  /** Every document written (pages, databases' properties, teamspaces). */
  documentCount: number;
}

const PARAGRAPH =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";

/** Writes the workspace into `dataDir`'s database. The server must not be running. */
export function seedWorkspace(dataDir: string, layout: SeedLayout = DEFAULT_LAYOUT): SeededWorkspace {
  const store = new Store(dataDir);
  const person = (name: string, role: Person["role"]): Person => {
    const p: Person = { id: crypto.randomUUID(), name, role };
    store.addPerson(p);
    return p;
  };
  const olive = person("Olive", "owner");
  const max = person("Max", "member");
  const gus = person("Gus", "guest");

  let pageCount = 0;
  let documentCount = 0;
  const save = (name: string, doc: Y.Doc) => {
    store.save(name, Y.encodeStateAsUpdate(doc));
    doc.destroy();
    documentCount++;
  };

  /** Writes one page document; `fill` adds to it (access, cells) in the same transaction. */
  const page = (
    opts: { title: string; section: string; order: string; parentId?: string | null; kind?: PageKind; body?: boolean },
    fill?: (doc: Y.Doc) => void,
  ): string => {
    const id = crypto.randomUUID();
    const doc = new Y.Doc();
    doc.transact(() => {
      const m = metaMap(doc);
      m.set("title", opts.title);
      m.set("kind", opts.kind ?? "page");
      m.set("parentId", opts.parentId ?? null);
      m.set("section", opts.section);
      m.set("order", opts.order);
      m.set("createdAt", Date.now());
      if (opts.body ?? true) writeBody(doc, opts.title);
      fill?.(doc);
    });
    save(pageDocName(id), doc);
    pageCount++;
    return id;
  };

  /** `count` pages in `section`, ten to a top-level page. Returns the top-level ids. */
  const pages = (prefix: string, section: string, count: number): string[] => {
    const tops = freshKeys(Math.ceil(count / 10));
    const ids: string[] = [];
    for (let g = 0, n = 0; n < count; g++) {
      const parentId = page({ title: `${prefix} ${++n}`, section, order: tops[g] });
      ids.push(parentId);
      const children = freshKeys(Math.min(9, count - n));
      for (const order of children) page({ title: `${prefix} ${++n}`, section, order, parentId });
    }
    return ids;
  };

  /** A top-level page shared with `who` at `level`, with `count` subpages that inherit it. */
  const sharedPage = (title: string, section: string, who: Person, level: AccessLevel, count: number) => {
    const parentId = page({ title, section, order: "a0" }, (doc) => setPersonAccess(doc, who.id, level));
    for (const [i, order] of freshKeys(count).entries()) page({ title: `${title} ${i + 1}`, section, order, parentId });
  };

  /** A database with three properties and `rows` rows. Returns the row ids. */
  const database = (title: string, section: string, rows: number, rowAccess?: (i: number) => [Person, AccessLevel] | null) => {
    const id = page({ title, section, order: "a1", kind: "database" }, (doc) => {
      const view = new Y.Map<unknown>();
      view.set("sort", null);
      view.set("filter", "");
      viewsMap(doc).set(DEFAULT_VIEW, view);
    });
    const schema = new Y.Doc();
    const points = addProperty(schema, "Points", "number");
    const done = addProperty(schema, "Done", "checkbox");
    const notes = addProperty(schema, "Notes", "text");
    save(schemaDocName(id), schema);
    for (const [i, order] of freshKeys(rows).entries()) {
      page({ title: `${title} row ${i + 1}`, section, order, parentId: id, kind: "row", body: false }, (doc) => {
        setCell(doc, points, (i * 7919) % 100);
        if (i % 3 === 2) setCell(doc, done, true);
        if (i % 5 === 0) {
          setCell(doc, notes, `Note for row ${i + 1}`);
          writeParagraphs(doc, [`Row ${i + 1}`, PARAGRAPH]);
        }
        const share = rowAccess?.(i);
        if (share) setPersonAccess(doc, share[0].id, share[1]);
      });
    }
  };

  const teamspace = (name: string, kind: "open" | "private", members: Person[]): string => {
    const id = crypto.randomUUID();
    const doc = new Y.Doc();
    createTeamspace(doc, { name, kind, owner: olive.id });
    for (const m of members) setTeamspaceMember(doc, m.id, "member");
    save(teamspaceDocName(id), doc);
    return id;
  };

  const olivePrivate = privateSection(olive.id);
  pages("Olive private", olivePrivate, layout.olivePrivate);
  pages("Max private", privateSection(max.id), layout.maxPrivate);
  sharedPage("Shared with Max", olivePrivate, max, "edit", layout.sharedWithMax);
  sharedPage("Trip", olivePrivate, gus, "edit", layout.tripForGus);
  database("Reading list", olivePrivate, layout.readingRows);

  const engineering = teamspaceSection(teamspace("Engineering", "open", [max]));
  const [engineeringPageId] = pages("Engineering", engineering, layout.engineering);
  database("Tasks", engineering, layout.tasksRows, (i) => (i < layout.rowsForGus ? [gus, "view"] : null));
  pages("Leadership", teamspaceSection(teamspace("Leadership", "private", [])), layout.leadership);

  store.close();
  return { people: { olive, max, gus }, pageCount, documentCount, engineeringPageId };
}

/** A heading and 30 paragraphs, shaped the way BlockNote stores them. */
function writeBody(doc: Y.Doc, title: string): void {
  writeParagraphs(doc, [title, ...Array.from({ length: 30 }, (_, i) => `Paragraph ${i + 1}. ${PARAGRAPH}`)]);
}

function writeParagraphs(doc: Y.Doc, texts: string[]): void {
  const group = new Y.XmlElement("blockGroup");
  doc.getXmlFragment("content").insert(0, [group]);
  group.insert(
    0,
    texts.map((text) => {
      const container = new Y.XmlElement("blockContainer");
      container.setAttribute("id", crypto.randomUUID());
      const paragraph = new Y.XmlElement("paragraph");
      paragraph.setAttribute("backgroundColor", "default");
      paragraph.setAttribute("textColor", "default");
      paragraph.setAttribute("textAlignment", "left");
      paragraph.insert(0, [new Y.XmlText(text)]);
      container.insert(0, [paragraph]);
      return container;
    }),
  );
}
