// The workspace and page last used on this device, so Notes reopens there (spec #130). Kept in
// this browser's storage only: a convenience, so blocked or cleared storage just loses it.

interface LastPlace {
  workspaceId: string | null;
  /** The page last open in each workspace, by workspace id. */
  pages: Record<string, string>;
}

const key = (personId: string) => `notes.lastPlace.${personId}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function readLastPlace(personId: string): LastPlace {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(key(personId)) ?? "null",
    );
    if (!isRecord(value)) return { workspaceId: null, pages: {} };
    const pages: Record<string, string> = {};
    if (isRecord(value.pages))
      for (const [workspaceId, pageId] of Object.entries(value.pages))
        if (typeof pageId === "string") pages[workspaceId] = pageId;
    return {
      workspaceId:
        typeof value.workspaceId === "string" ? value.workspaceId : null,
      pages,
    };
  } catch {
    return { workspaceId: null, pages: {} };
  }
}

/** Remembers that `workspaceId` is open, on `pageId` if a page is. */
export function rememberPlace(
  personId: string,
  workspaceId: string,
  pageId: string | null,
): void {
  const place = readLastPlace(personId);
  place.workspaceId = workspaceId;
  if (pageId) place.pages[workspaceId] = pageId;
  try {
    localStorage.setItem(key(personId), JSON.stringify(place));
  } catch {
    // Blocked or full storage: Notes then opens on the first workspace, as on a new device.
  }
}
