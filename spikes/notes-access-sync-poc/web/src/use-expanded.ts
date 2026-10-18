import { useCallback, useState } from "react";

const KEY = "notes-access.expanded";

function load(): Set<string> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return new Set(
      Array.isArray(saved)
        ? saved.filter((id): id is string => typeof id === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

/** Which sidebar items are expanded. Per device, like Notion; not synced. */
export function useExpanded() {
  const [expanded, setState] = useState(load);
  const setExpanded = useCallback((id: string, open: boolean) => {
    setState((prev) => {
      if (prev.has(id) === open) return prev;
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      try {
        localStorage.setItem(KEY, JSON.stringify([...next]));
      } catch {
        // Non-fatal: expansion just won't be remembered.
      }
      return next;
    });
  }, []);
  return { isExpanded: (id: string) => expanded.has(id), setExpanded };
}
