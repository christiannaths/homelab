import { useEffect, useState } from "react";
import type * as Y from "yjs";
import {
  addSelectOption,
  setCell,
  type CellValue,
  type Property,
} from "../model/database";

interface CellProps {
  doc: Y.Doc;
  rowId: string;
  prop: Property;
  value: CellValue | undefined;
  className?: string;
}

/**
 * Text-like cells keep a local draft while focused and write on blur or Enter.
 * Writing on every keystroke would let a remote edit to the same cell move the
 * caret mid-word. Cells are last-writer-wins, unlike page bodies.
 */
function DraftInput({
  value,
  commit,
  type = "text",
  className,
  testId,
}: {
  value: string;
  commit: (v: string) => void;
  type?: "text" | "number";
  className?: string;
  testId?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);
  return (
    <input
      className={className}
      data-testid={testId}
      type={type}
      value={draft}
      onFocus={() => setFocused(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setFocused(false);
        if (draft !== value) commit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value);
          setFocused(false);
        }
      }}
    />
  );
}

export function CellEditor({ doc, rowId, prop, value, className }: CellProps) {
  const set = (v: CellValue) => setCell(doc, rowId, prop.id, v);
  const testId = `cell-${prop.name}`;
  switch (prop.type) {
    case "number":
      return (
        <DraftInput
          className={className}
          testId={testId}
          type="number"
          value={value === undefined || value === null ? "" : String(value)}
          commit={(v) =>
            set(v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v))
          }
        />
      );
    case "checkbox":
      return (
        <input
          type="checkbox"
          data-testid={testId}
          className="cell-checkbox"
          checked={!!value}
          onChange={(e) => set(e.target.checked ? true : null)}
        />
      );
    case "date":
      return (
        <input
          type="date"
          data-testid={testId}
          className={className}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => set(e.target.value || null)}
        />
      );
    case "select": {
      const option = prop.options.find((o) => o.id === value);
      return (
        <select
          className={className}
          data-testid={testId}
          value={option ? option.id : ""}
          style={option ? { background: option.color } : undefined}
          onChange={(e) => {
            if (e.target.value === "__new") {
              const name = prompt(`New option for "${prop.name}"`)?.trim();
              if (name) set(addSelectOption(doc, prop.id, name));
            } else set(e.target.value || null);
          }}
        >
          <option value="">—</option>
          {prop.options.map((o) => (
            <option
              key={o.id}
              value={o.id}
            >
              {o.name}
            </option>
          ))}
          <option value="__new">+ New option…</option>
        </select>
      );
    }
    default:
      return (
        <DraftInput
          className={className}
          testId={testId}
          value={
            typeof value === "string"
              ? value
              : value == null
                ? ""
                : String(value)
          }
          commit={(v) => set(v)}
        />
      );
  }
}
