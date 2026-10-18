import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useMemo, useRef, useState } from "react";
import type * as Y from "yjs";
import {
  addProperty,
  addRow,
  computeView,
  deleteProperty,
  deleteRow,
  PROP_TYPES,
  renameProperty,
  setSort,
  TITLE,
  type PropType,
  type Property,
} from "../model/database";
import type { PageMeta } from "../model/tree";
import { useDatabase, useLocalReady, useSyncManager } from "../sync/context";
import type { DocEntry } from "../sync/sync-manager";
import { databaseDocName, renamePage, trashPage } from "../sync/workspace";
import { CellEditor } from "./cells";

interface Props {
  page: PageMeta;
  workspace: Y.Doc;
}

export function DatabaseView({ page, workspace }: Props) {
  const manager = useSyncManager();
  const entry = manager.open(databaseDocName(page.id));
  const ready = useLocalReady(entry);
  return (
    <article className="page database">
      <div className="page-head">
        <input
          className="page-title"
          data-testid="page-title"
          placeholder="Untitled database"
          value={page.title}
          onChange={(e) => renamePage(workspace, page.id, e.target.value)}
        />
        <button
          className="trash"
          onClick={() => {
            trashPage(workspace, page.id);
            location.hash = "#/";
          }}
        >
          Delete
        </button>
      </div>
      {ready ? (
        <Table
          key={entry.name}
          entry={entry}
          dbId={page.id}
        />
      ) : (
        <p className="muted">Loading…</p>
      )}
    </article>
  );
}

const ROW_HEIGHT = 36;
const columnWidth = (p: Property) =>
  p.type === "title" ? 260 : p.type === "checkbox" ? 90 : 170;

function Table({ entry, dbId }: { entry: DocEntry; dbId: string }) {
  const doc = entry.doc;
  const db = useDatabase(doc);
  const [filter, setFilter] = useState("");
  const { rows, ms } = useMemo(() => {
    const started = performance.now();
    const viewRows = computeView(db.rows, db.schema, db.view, filter);
    return { rows: viewRows, ms: performance.now() - started };
  }, [db, filter]);

  const scrollRef = useRef<HTMLDivElement>(null);
  // oxlint-disable-next-line react/incompatible-library -- TanStack Virtual returns mutable state by design; this component is not memoised by the React Compiler.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });
  if (!db.schema.some((p) => p.id === TITLE)) {
    // Only the creating device initialises a database (see createDatabase), so a
    // device that hasn't synced it yet waits rather than writing a competing schema.
    return (
      <p
        className="muted"
        data-testid="db-waiting"
      >
        Waiting for this database to sync…
      </p>
    );
  }

  const template = [
    ...db.schema.map((p) => `${columnWidth(p)}px`),
    "40px",
  ].join(" ");
  const sort = db.view.sort;

  const cycleSort = (p: Property) => {
    if (sort?.propId !== p.id) setSort(doc, { propId: p.id, dir: "asc" });
    else if (sort.dir === "asc") setSort(doc, { propId: p.id, dir: "desc" });
    else setSort(doc, null);
  };

  return (
    <div className="db">
      <div className="db-toolbar">
        <input
          className="db-filter"
          placeholder="Filter rows…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          data-testid="db-filter"
        />
        <AddProperty onAdd={(name, type) => addProperty(doc, name, type)} />
        <span
          className="muted db-stats"
          data-testid="db-stats"
          data-rows={rows.length}
        >
          {rows.length.toLocaleString()} {rows.length === 1 ? "row" : "rows"} ·
          read {db.readMs.toFixed(0)} ms · view {ms.toFixed(0)} ms
        </span>
      </div>
      <div
        className="db-scroll"
        ref={scrollRef}
        data-testid="db-scroll"
      >
        <div
          className="db-grid db-header"
          style={{ gridTemplateColumns: template }}
        >
          {db.schema.map((p) => (
            <div
              key={p.id}
              className="db-th"
              data-testid="db-column"
            >
              <button
                className="db-th-name"
                onClick={() => cycleSort(p)}
                title="Sort"
              >
                {p.name}
                {sort?.propId === p.id
                  ? sort.dir === "asc"
                    ? " ↑"
                    : " ↓"
                  : ""}
              </button>
              <span className="db-th-actions">
                <button
                  title="Rename"
                  onClick={() => {
                    const name = prompt("Property name", p.name)?.trim();
                    if (name) renameProperty(doc, p.id, name);
                  }}
                >
                  ✎
                </button>
                {p.id !== TITLE && (
                  <button
                    title="Delete property"
                    onClick={() =>
                      confirm(`Delete "${p.name}"?`) &&
                      deleteProperty(doc, p.id)
                    }
                  >
                    ×
                  </button>
                )}
              </span>
            </div>
          ))}
          <div />
        </div>
        <div
          style={{ height: virtualizer.getTotalSize(), position: "relative" }}
        >
          {virtualizer.getVirtualItems().map((v) => {
            const row = rows[v.index];
            return (
              <div
                key={row.id}
                className="db-grid db-row"
                data-testid="db-row"
                style={{
                  gridTemplateColumns: template,
                  transform: `translateY(${v.start}px)`,
                  height: ROW_HEIGHT,
                }}
              >
                {db.schema.map((p) => (
                  <div
                    key={p.id}
                    className="db-td"
                  >
                    <CellEditor
                      doc={doc}
                      rowId={row.id}
                      prop={p}
                      value={row.cells[p.id]}
                      className="cell-input"
                    />
                    {p.type === "title" && (
                      <a
                        className="open-row"
                        href={`#/row/${dbId}/${row.id}`}
                        title="Open as page"
                        data-testid="open-row"
                      >
                        ↗
                      </a>
                    )}
                  </div>
                ))}
                <button
                  className="row-delete"
                  title="Delete row"
                  onClick={() => deleteRow(doc, row.id)}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <button
        className="side-action"
        data-testid="new-row"
        onClick={() => {
          addRow(doc);
          // Show the new row: it's last in the default order.
          requestAnimationFrame(() =>
            virtualizer.scrollToIndex(rows.length, { align: "end" }),
          );
        }}
      >
        + New row
      </button>
    </div>
  );
}

function AddProperty({
  onAdd,
}: {
  onAdd: (name: string, type: PropType) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<PropType>("text");
  const focusOnMount = useCallback((el: HTMLInputElement | null) => {
    el?.focus();
  }, []);
  if (!open)
    return (
      <button
        className="side-action"
        onClick={() => setOpen(true)}
        data-testid="add-property"
      >
        + Property
      </button>
    );
  return (
    <form
      className="add-prop"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onAdd(name.trim(), type);
        setName("");
        setOpen(false);
      }}
    >
      <input
        ref={focusOnMount}
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        data-testid="property-name"
      />
      <select
        value={type}
        onChange={(e) => {
          const next = PROP_TYPES.find((t) => t === e.currentTarget.value);
          if (next) setType(next);
        }}
        data-testid="property-type"
      >
        {PROP_TYPES.map((t) => (
          <option
            key={t}
            value={t}
          >
            {t}
          </option>
        ))}
      </select>
      <button
        type="submit"
        data-testid="property-submit"
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
      >
        Cancel
      </button>
    </form>
  );
}
