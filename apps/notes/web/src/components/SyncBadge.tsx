import { useSyncSnapshot } from "../sync/context";

export function SyncBadge() {
  const s = useSyncSnapshot();
  let label: string;
  let tone: "ok" | "busy" | "off";
  if (s.connection !== "connected") {
    tone = "off";
    label = s.pendingChanges > 0 ? `Offline · ${s.pendingChanges} change(s) saved locally` : "Offline · saved locally";
  } else if (s.synced < s.total || s.pendingChanges > 0) {
    tone = "busy";
    label = `Syncing ${s.synced}/${s.total}`;
  } else {
    tone = "ok";
    label = "Synced";
  }
  return (
    <span className={`badge badge-${tone}`} data-testid="sync-badge" data-connection={s.connection}>
      <span className="dot" /> {label}
    </span>
  );
}
