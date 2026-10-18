import { useEffect, useState } from "react";
import { BlockNoteEditor } from "@blocknote/core";
import { blocksToYDoc } from "@blocknote/core/yjs";
import * as Y from "yjs";
import { loadToken } from "../identity";
import { useSyncManager, useSyncSnapshot } from "../sync/context";
import { addProperty, addRow, addSelectOption, TITLE } from "../model/database";
import { freshKeys } from "../model/order";
import type { Tree } from "../model/tree";
import {
  createDatabase,
  createPage,
  databaseDocName,
  pageDocName,
} from "../sync/workspace";

interface EnvInfo {
  persisted: boolean | null;
  usageMB: number | null;
  quotaMB: number | null;
  serviceWorker: boolean;
  standalone: boolean;
  online: boolean;
}

async function readEnv(): Promise<EnvInfo> {
  const est = await navigator.storage?.estimate?.().catch(() => undefined);
  return {
    persisted:
      (await navigator.storage?.persisted?.().catch(() => null)) ?? null,
    usageMB: est?.usage != null ? est.usage / 1e6 : null,
    quotaMB: est?.quota != null ? est.quota / 1e6 : null,
    serviceWorker: !!navigator.serviceWorker?.controller,
    standalone:
      matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    online: navigator.onLine,
  };
}

const fmt = (ms?: number) => (ms === undefined ? "—" : `${Math.round(ms)} ms`);

export function Diagnostics({
  workspace,
  tree,
}: {
  workspace: Y.Doc;
  tree: Tree;
}) {
  const manager = useSyncManager();
  const s = useSyncSnapshot();
  const [env, setEnv] = useState<EnvInfo | null>(null);
  const [seeding, setSeeding] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      void readEnv().then(setEnv);
    };
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, []);

  async function seed(count: number) {
    setSeeding(`Creating ${count} pages…`);
    const started = performance.now();
    // A headless editor builds realistic BlockNote content for the test pages.
    const editor = BlockNoteEditor.create();
    const blocks = [
      { type: "heading" as const, content: "Test page" },
      ...Array.from({ length: 30 }, (_, i) => ({
        type: "paragraph" as const,
        content: `Paragraph ${i + 1}. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`,
      })),
    ];
    const content = Y.encodeStateAsUpdate(
      blocksToYDoc(editor, blocks, "content"),
    );
    manager.resetTimings();
    const orders = freshKeys(count, tree.roots.at(-1)?.page.order ?? null);
    workspace.transact(() => {
      for (let i = 0; i < count; i++) {
        const id = createPage(workspace, tree, {
          title: `Test page ${i + 1}`,
          order: orders[i],
        });
        Y.applyUpdate(manager.open(pageDocName(id)).doc, content);
      }
    });
    setSeeding(
      `Created ${count} pages in ${Math.round(performance.now() - started)} ms`,
    );
  }

  function seedDatabase(rowCount: number) {
    setSeeding(`Creating a database with ${rowCount} rows…`);
    const started = performance.now();
    const id = createDatabase(
      workspace,
      tree,
      (name) => manager.open(name).doc,
      {
        title: `Test database (${rowCount.toLocaleString()} rows)`,
      },
    );
    const db = manager.open(databaseDocName(id)).doc;
    const status = addProperty(db, "Status", "select");
    const options = ["Backlog", "In progress", "Done"].map((n) =>
      addSelectOption(db, status, n),
    );
    const points = addProperty(db, "Points", "number");
    const done = addProperty(db, "Done", "checkbox");
    const due = addProperty(db, "Due", "date");
    const notes = addProperty(db, "Notes", "text");
    const orders = freshKeys(rowCount);
    db.transact(() => {
      for (let i = 0; i < rowCount; i++) {
        const day = String((i % 28) + 1).padStart(2, "0");
        const rowId = addRow(db, {
          [TITLE]: `Task ${i + 1}`,
          [status]: options[i % 3],
          [points]: (i * 7919) % 100,
          [done]: i % 3 === 2 ? true : null,
          [due]: `2026-${String((i % 12) + 1).padStart(2, "0")}-${day}`,
          [notes]: i % 5 === 0 ? `Note for task ${i + 1}` : null,
        });
        db.getMap<Y.Map<unknown>>("rows").get(rowId)!.set("_order", orders[i]);
      }
    });
    setSeeding(
      `Created a database with ${rowCount} rows in ${Math.round(performance.now() - started)} ms`,
    );
    location.hash = `#/page/${id}`;
  }

  return (
    <article
      className="page diagnostics"
      data-testid="diagnostics"
    >
      <h1>Diagnostics</h1>
      <h2>Sync</h2>
      <table>
        <tbody>
          <tr>
            <td>Connection</td>
            <td data-testid="diag-connection">{s.connection}</td>
          </tr>
          <tr>
            <td>Documents</td>
            <td data-testid="diag-total">{s.total}</td>
          </tr>
          <tr>
            <td>Loaded from device</td>
            <td data-testid="diag-local">{s.localLoaded}</td>
          </tr>
          <tr>
            <td>Synced with server</td>
            <td data-testid="diag-synced">{s.synced}</td>
          </tr>
          <tr>
            <td>Pending local changes</td>
            <td>{s.pendingChanges}</td>
          </tr>
          <tr>
            <td>All docs loaded locally after</td>
            <td data-testid="diag-local-ms">{fmt(s.allLocalLoadedMs)}</td>
          </tr>
          <tr>
            <td>All docs synced after</td>
            <td data-testid="diag-synced-ms">{fmt(s.allSyncedMs)}</td>
          </tr>
        </tbody>
      </table>
      <h2>Device</h2>
      {env && (
        <table>
          <tbody>
            <tr>
              <td>Service worker controlling page</td>
              <td data-testid="diag-sw">{String(env.serviceWorker)}</td>
            </tr>
            <tr>
              <td>Installed (standalone)</td>
              <td>{String(env.standalone)}</td>
            </tr>
            <tr>
              <td>Persistent storage granted</td>
              <td>{String(env.persisted)}</td>
            </tr>
            <tr>
              <td>Storage used / quota</td>
              <td>
                {env.usageMB?.toFixed(1)} MB / {env.quotaMB?.toFixed(0)} MB
              </td>
            </tr>
            <tr>
              <td>navigator.onLine</td>
              <td>{String(env.online)}</td>
            </tr>
          </tbody>
        </table>
      )}
      <h2>Server token</h2>
      <p className="muted">Only needed if the server sets LOCALNOTION_TOKEN.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const token = new FormData(e.currentTarget).get("token");
          const value = typeof token === "string" ? token : "";
          try {
            localStorage.setItem("localnotion.token", value);
          } catch {
            // Storage unavailable: nothing to persist to.
          }
          location.reload();
        }}
      >
        <input
          name="token"
          type="password"
          defaultValue={loadToken() ?? ""}
        />{" "}
        <button type="submit">Save &amp; reconnect</button>
      </form>
      <h2>Load test</h2>
      <p>
        <button
          onClick={() => {
            void seed(100);
          }}
          disabled={seeding?.endsWith("…")}
          data-testid="seed-100"
        >
          Create 100 test pages
        </button>{" "}
        <button
          onClick={() => {
            void seed(500);
          }}
          disabled={seeding?.endsWith("…")}
        >
          Create 500 test pages
        </button>{" "}
        <button
          onClick={() => seedDatabase(5000)}
          disabled={seeding?.endsWith("…")}
          data-testid="seed-db"
        >
          Create test database (5,000 rows)
        </button>
      </p>
      {seeding && <p data-testid="seed-status">{seeding}</p>}
      <p className="muted">
        Reload the app (online or offline) to measure startup time with the
        current number of documents.
      </p>
    </article>
  );
}
