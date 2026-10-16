import type * as Y from "yjs";
import type { Identity } from "../identity";
import { markRowHasBody, TITLE } from "../model/database";
import type { PageMeta } from "../model/tree";
import { useDatabase, useLocalReady, useSyncManager } from "../sync/context";
import { databaseDocName, pageDocName } from "../sync/workspace";
import { CellEditor } from "./cells";
import { Editor, hasContent } from "./PageView";

interface Props {
  database: PageMeta;
  rowId: string;
  identity: Identity;
}

/** A database row opened as a page: its properties, then a page body. */
export function RowPage({ database, rowId, identity }: Props) {
  const manager = useSyncManager();
  const dbEntry = manager.open(databaseDocName(database.id));
  const ready = useLocalReady(dbEntry);
  return ready ? <RowPageBody db={dbEntry.doc} database={database} rowId={rowId} identity={identity} /> : null;
}

function RowPageBody({ db, database, rowId, identity }: { db: Y.Doc } & Props) {
  const manager = useSyncManager();
  const { schema, rows } = useDatabase(db);
  const row = rows.find((r) => r.id === rowId);
  // The body doc is opened on view; keepWorkspaceLocal only syncs bodies that have content.
  const body = manager.open(pageDocName(rowId));
  const bodyReady = useLocalReady(body);
  const title = schema.find((p) => p.id === TITLE);

  if (!row || !title) return <p className="muted page">This row doesn't exist (it may have been deleted).</p>;
  return (
    <article className="page row-page">
      <a className="muted back" href={`#/page/${database.id}`}>
        ← {database.title || "Untitled database"}
      </a>
      <CellEditor doc={db} rowId={row.id} prop={title} value={row.cells[TITLE]} className="page-title row-title" />
      <table className="row-props">
        <tbody>
          {schema
            .filter((p) => p.id !== TITLE)
            .map((p) => (
              <tr key={p.id}>
                <td className="muted">{p.name}</td>
                <td>
                  <CellEditor doc={db} rowId={row.id} prop={p} value={row.cells[p.id]} className="cell-input" />
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      {bodyReady && (
        <Editor
          key={body.name}
          entry={body}
          identity={identity}
          onChange={(blocks) => {
            if (!row.hasBody && hasContent(blocks)) markRowHasBody(db, row.id);
          }}
        />
      )}
    </article>
  );
}
